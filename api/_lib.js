/* Общий код API: база данных, вход, журнал, Telegram. Файлы с «_» Vercel не публикует как адреса. */
const crypto = require('crypto');
const DEFAULTS = require('./_defaults');

/* ---------- база (Postgres: Neon / Vercel Postgres / любой) ---------- */
let pool = null, ready = null;
function dbUrl() { return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || ''; }
async function q(text, params) {
  if (global.__PAMYAT_DB) return global.__PAMYAT_DB.query(text, params || []);   // локальные тесты
  if (!pool) {
    const url = dbUrl();
    if (!url) throw Object.assign(new Error('DATABASE_URL не задан в настройках Vercel'), { code: 'NO_DB' });
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 3 });
  }
  return pool.query(text, params || []);
}
async function init() {
  if (ready) return ready;
  ready = (async () => {
    await q(`create table if not exists kv (key text primary key, value jsonb not null, updated_at timestamptz default now())`);
    await q(`create table if not exists images (id serial primary key, mime text not null, data bytea not null, created_at timestamptz default now())`);
    await q(`create table if not exists leads (id serial primary key, created_at timestamptz default now(), type text, name text, phone text,
      comment text, price integer, config jsonb, source text, status text default 'новая', taken_by text, tg_msg_id bigint, history jsonb default '[]'::jsonb)`);
    await q(`create table if not exists admin_log (id serial primary key, at timestamptz default now(), action text, detail text, ip text, ok boolean default true)`);
    await q(`create table if not exists team_notes (id serial primary key, title text not null default 'Новая заметка', body text not null default '', created_by text not null default '', updated_by text not null default '', created_at timestamptz default now(), updated_at timestamptz default now(), version integer not null default 1)`);
    await q(`create table if not exists price_catalog (
      id smallint primary key default 1 check (id=1),
      items jsonb not null default '[]'::jsonb,
      site_sync boolean not null default false,
      updated_at timestamptz default now(),
      updated_by text
    )`);
    await q(`insert into price_catalog(id,items,site_sync) values(1,'[]'::jsonb,false) on conflict(id) do nothing`);
    await q(`create table if not exists estimates (
      id serial primary key,
      lead_id integer references leads(id) on delete set null,
      client_name text not null default '',
      client_phone text not null default '',
      items jsonb not null default '[]'::jsonb,
      total numeric(12,2) not null default 0,
      discount numeric(12,2) not null default 0,
      notes text not null default '',
      status text not null default 'draft',
      public_token text not null unique,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      created_by text not null default ''
    )`);
    await q(`alter table estimates add column if not exists telegram_message_id bigint`);
    await q(`alter table estimates add column if not exists telegram_chat_id text`);
  })();
  try { await ready; } catch (e) { ready = null; throw e; }
  return ready;
}

/* ---------- содержимое сайта ---------- */
function merge(base, over) {
  if (Array.isArray(over)) return over;
  if (over && typeof over === 'object' && base && typeof base === 'object' && !Array.isArray(base)) {
    const out = Object.assign({}, base);
    for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}
async function getContent() {
  await init();
  const r = await q(`select value from kv where key='content'`);
  return merge(JSON.parse(JSON.stringify(DEFAULTS)), r.rows[0] ? r.rows[0].value : {});
}
async function saveContent(c) {
  await init();
  await q(`insert into kv(key,value,updated_at) values('content',$1,now()) on conflict(key) do update set value=excluded.value, updated_at=now()`, [JSON.stringify(c)]);
}
function publicContent(c) {
  const p = JSON.parse(JSON.stringify(c));
  p.telegram = { enabled: !!(c.telegram && c.telegram.enabled && c.telegram.token && c.telegram.chat) };
  return p;
}

/* ---------- вход: логин + пароль, подписанная cookie ---------- */
function secret() {
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update('pamyat|' + (process.env.ADMIN_PASSWORD || '') + '|' + dbUrl()).digest('hex');
}
function hashPw(pw, salt) { return crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
function safeEq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
async function checkLogin(login, password) {
  await init();
  const r = await q(`select value from kv where key='admin'`);
  if (r.rows[0]) {
    const a = r.rows[0].value;
    return safeEq(login, a.login) && safeEq(hashPw(password, a.salt), a.hash);
  }
  const L = process.env.ADMIN_LOGIN, P = process.env.ADMIN_PASSWORD;
  if (!L || !P) return false;                                   // без логина/пароля в Vercel вход закрыт
  return safeEq(login, L) && safeEq(password, P);
}
async function setPassword(login, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  await q(`insert into kv(key,value,updated_at) values('admin',$1,now()) on conflict(key) do update set value=excluded.value, updated_at=now()`,
    [JSON.stringify({ login, salt, hash: hashPw(password, salt) })]);
}
function sign(payload) {
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return b + '.' + crypto.createHmac('sha256', secret()).update(b).digest('base64url');
}
function verify(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [b, s] = tok.split('.');
  const good = crypto.createHmac('sha256', secret()).update(b).digest('base64url');
  if (!safeEq(s, good)) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
function cookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach(function (c) { const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function session(req) { return verify(cookies(req).pb_s); }
function setSession(res, login) {
  const days = 7, tok = sign({ u: login, exp: Date.now() + days * 864e5 });
  res.setHeader('Set-Cookie', `pb_s=${encodeURIComponent(tok)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${days * 86400}`);
}
function clearSession(res) { res.setHeader('Set-Cookie', 'pb_s=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'); }

/* ---------- журнал ---------- */
function ip(req) { return String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim(); }
async function log(req, action, detail, ok) {
  try { await init(); await q(`insert into admin_log(action,detail,ip,ok) values($1,$2,$3,$4)`, [action, String(detail || '').slice(0, 2000), ip(req), ok !== false]); } catch (e) { }
}

/* ---------- ответы ---------- */
function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b || {};
}
function send(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); }
function fail(res, e) {
  if (e && e.code === 'NO_DB') return send(res, 503, { ok: false, error: e.message });
  console.error(e); return send(res, 500, { ok: false, error: 'Ошибка сервера' });
}
async function requireAdmin(req, res) {
  const s = session(req);
  if (!s) { send(res, 401, { ok: false, error: 'Нужен вход' }); return null; }
  return s;
}

/* ---------- Telegram ---------- */
async function tg(token, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  return r.json();
}
function tgSecret() { return crypto.createHmac('sha256', secret()).update('tg-webhook').digest('hex').slice(0, 48); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
function leadText(L) {
  const time = new Date(L.created_at || Date.now()).toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' });
  const status = String(L.status || 'новая');
  const statusIcon = ({
    'новая':'🟡', 'взята в работу':'🔵', 'связались':'🟣',
    'назначен замер':'🩵', 'отправлена смета':'🟠',
    'заключён договор':'🟢', 'отказ':'🔴', 'завершена':'✅'
  })[status] || '📌';
  const type = L.type === 'calc' ? 'Расчёт с сайта' : 'Звонок / консультация';
  const amount = L.price == null ? 'Индивидуальный расчёт' : Number(L.price).toLocaleString('ru-RU') + ' BYN';
  const lines = [
    '<b>🟤 ПАМЯТЬ.БАЙ · ЗАЯВКА №' + L.id + '</b>',
    statusIcon + ' <b>' + esc(status.toLocaleUpperCase('ru-RU')) + '</b>',
    '',
    '👤 <b>Клиент:</b> ' + esc(L.name || 'Не указано'),
    '📞 <b>Телефон:</b> ' + esc(L.phone || 'Не указан'),
    '🗓 <b>Дата:</b> ' + esc(time),
    '🧩 <b>Тип заявки:</b> ' + esc(type),
    '💰 <b>Предварительная сумма:</b> ' + esc(amount)
  ];
  if (L.config && L.config.summary) {
    const summary = String(L.config.summary).split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,18);
    lines.push('', '📋 <b>Клиент выбрал:</b>');
    summary.forEach(s => lines.push('  • ' + esc(s.slice(0,220))));
  }
  if (L.comment) lines.push('', '💬 <b>Комментарий:</b> ' + esc(String(L.comment).slice(0,700)));
  if (L.taken_by) lines.push('👷 <b>Ответственный:</b> ' + esc(L.taken_by));
  lines.push('', '<i>Изменяйте статус кнопками ниже. Для расчёта нажмите «Смета PDF».</i>');
  return lines.join(String.fromCharCode(10));
}

/* ---------- каталог цен и сметы ---------- */
async function getPriceBook() {
  await init();
  const r = await q(`select items, site_sync, updated_at, updated_by from price_catalog where id=1`);
  const row = r.rows[0] || {};
  return { items: row.items || [], siteSync: !!row.site_sync, updatedAt: row.updated_at || null, updatedBy: row.updated_by || '' };
}
function applySitePriceBook(content, book) {
  const c = JSON.parse(JSON.stringify(content || {}));
  if (!book || !book.siteSync || !Array.isArray(book.items)) return c;
  book.items.forEach(function (p) {
    if (p.price === null || p.price === '' || !Number.isFinite(Number(p.price))) return;
    const target = String(p.siteTarget || '');
    const price = Math.round(Math.max(0, Number(p.price)) * 100) / 100;
    let m = /^catalog:(.+)$/.exec(target);
    if (m && c.catalog && Array.isArray(c.catalog.categories)) {
      const cat = c.catalog.categories.find(x => x.id === m[1]);
      if (cat) cat.price = price;
      return;
    }
    m = /^calc:([^:]+):(.+)$/.exec(target);
    if (m && c.calc && Array.isArray(c.calc.steps)) {
      const st = c.calc.steps.find(x => x.id === m[1]);
      const it = st && Array.isArray(st.items) ? st.items.find(x => x.id === m[2]) : null;
      if (it) it.price = price;
    }
  });
  return c;
}
async function getSiteContent() {
  const c = await getContent();
  return applySitePriceBook(c, await getPriceBook());
}
function leadKeyboard(id, currentStatus) {
  const current = String(currentStatus || 'новая');
  const names = {
    'новая':'Новая',
    'взята в работу':'Взята в работу',
    'связались':'Связались',
    'назначен замер':'Назначен замер',
    'отправлена смета':'Смета отправлена',
    'заключён договор':'Договор',
    'завершена':'Завершена',
    'отказ':'Отказ'
  };
  const button = (status, callback) => ({
    // A separate green dot on the first line marks the active stage without the old checkmark label.
    text: current === status ? '🟢\n' + names[status] : names[status],
    callback_data: callback + id
  });
  return { inline_keyboard: [
    [button('новая','status:n:'), button('взята в работу','status:w:')],
    [button('связались','status:c:'), button('назначен замер','status:m:')],
    [button('отправлена смета','status:q:'), button('заключён договор','status:d:')],
    [button('завершена','status:f:'), button('отказ','status:x:')],
    [{ text:'📄 Смета PDF', callback_data:'quote:' + id }]
  ] };
}
function estimateDimensionMetrics(raw, config) {
  const length = Number(raw && raw.length), width = Number(raw && raw.width);
  const min = Math.max(0.01, Number(config && config.min) || 0.1);
  const max = Math.max(min, Number(config && config.max) || 100);
  if (!Number.isFinite(length) || !Number.isFinite(width) || length < min || width < min || length > max || width > max) {
    return { provided: false, length: null, width: null, area: null, perimeter: null };
  }
  return { provided: true, length, width, area: length * width, perimeter: 2 * (length + width) };
}
function estimateMeasure(basis, dimensions) {
  if (!dimensions || !dimensions.provided) return 1;
  if (basis === 'perimeter') return dimensions.perimeter;
  if (basis === 'halfPerimeter') return dimensions.perimeter / 2;
  if (basis === 'length') return dimensions.length;
  if (basis === 'width') return dimensions.width;
  return dimensions.area;
}
function estimatePricing(item, basePrice, dimensions) {
  const name = String(item && item.name || '');
  const raw = item && item.pricing || {};
  const inferred = /(?:м²|м2|кв\.?\s*м)/i.test(name) ? 'area'
    : /(?:м\.?\s*п\.?|погонн(?:ый|ых)?\s+метр)/i.test(name) ? 'linear' : 'fixed';
  const mode = raw.mode || inferred;
  const unit = mode === 'area' || raw.quantity === 'area' ? 'м²' : mode === 'linear' ? 'м.п.' : (item.unit || 'шт.');
  const price = Math.max(0, Number(basePrice) || 0);
  if (mode !== 'area' && mode !== 'linear') return { qty: 1, unit, price, coefficient: 1, note: '' };
  if (!dimensions || !dimensions.provided) {
    return { qty: 1, unit, price, coefficient: 1, note: 'Размеры не указаны — использована базовая цена за единицу.' };
  }
  const quantity = mode === 'area' ? dimensions.area : estimateMeasure(raw.quantity || 'perimeter', dimensions);
  const k = raw.coefficient || {};
  let coefficient = 1;
  if (k.enabled === true) {
    const basis = k.basis || 'area';
    const value = estimateMeasure(basis, dimensions);
    const reference = Math.max(0.01, Number(k.reference) || 4);
    const diff = value - reference;
    const active = k.applyWhen === 'both' || (k.applyWhen === 'below' && diff < 0) || (k.applyWhen === 'above' && diff > 0);
    if (active) {
      const start = Math.max(0, Number(k.start) || 1);
      coefficient = k.formula === 'inverse'
        ? start * Math.pow(reference / Math.max(0.01, value), Math.max(0.01, Number(k.power) || 1))
        : start + Math.abs(diff) * Math.max(0, Number(k.rate) || 0);
      const min = Math.max(0, Number(k.min) || 0), max = Math.max(min, Number(k.max) || 2);
      coefficient = Math.min(max, Math.max(min, coefficient));
    }
  }
  const adjustedPrice = Math.round(price * coefficient * 1000000) / 1000000;
  const q = Math.round(quantity * 1000000) / 1000000;
  const notes = [
    'Размеры участка: ' + dimensions.length.toLocaleString('ru-RU') + ' × ' + dimensions.width.toLocaleString('ru-RU') + ' м',
    'Площадь: ' + dimensions.area.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' м²',
    'Коэффициент: ' + coefficient.toLocaleString('ru-RU', { maximumFractionDigits: 2 }),
    'Базовая цена: ' + price.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' BYN/' + unit
  ];
  return { qty: q, unit, price: adjustedPrice, coefficient, note: notes.join('; ') };
}

async function createEstimateFromLead(leadId, by) {
  await init();
  const leadResult = await q(`select * from leads where id=$1 limit 1`, [leadId]);
  const lead = leadResult.rows[0];
  if (!lead) throw Object.assign(new Error('Заявка не найдена'), { code: 'NO_LEAD' });

  // The public calculator and the estimate use the same active catalogue.
  // If "site_sync" is enabled, apply the finance price book before calculating.
  const book = await getPriceBook();
  const content = applySitePriceBook(await getContent(), book);
  const sel = lead.config && lead.config.sel && typeof lead.config.sel === 'object' ? lead.config.sel : {};
  const rows = [];
  const catalog = content.catalog || { categories: [], items: [] };
  function articleForTarget(target, fallback) {
    if (book.siteSync) {
      const entry = (book.items || []).find(function (p) {
        return String(p.siteTarget || '') === target && String(p.article || '').trim();
      });
      if (entry) return String(entry.article).trim();
    }
    return String(fallback || '—');
  }
  function priceForTarget(target, fallback) {
    if (book.siteSync) {
      const entry = (book.items || []).find(function (p) {
        return String(p.siteTarget || '') === target && p.price !== null && p.price !== '' &&
          Number.isFinite(Number(p.price));
      });
      if (entry) return Math.max(0, Number(entry.price));
    }
    return fallback == null ? 0 : Number(fallback);
  }

  const categoryId = sel.monument || '';
  const category = (catalog.categories || []).find(x => x.id === categoryId);
  if (category) {
    const modelCode = lead.config && lead.config.model;
    const model = modelCode && (catalog.items || []).find(x => x.code === modelCode);
    const target = 'catalog:' + categoryId;
    const article = modelCode || articleForTarget(target, category.article || category.sku || ('CAT-' + String(categoryId).toUpperCase()));
    rows.push({
      article: String(article),
      name: category.name + (model ? ' · модель ' + model.code : (modelCode ? ' · модель ' + modelCode : '')),
      unit: 'комплект', qty: 1,
      price: priceForTarget(target, category.price),
      note: category.price == null ? 'Цена не задана в каталоге — подтвердить вручную' : ''
    });
  }

  const missing = [];
  (content.calc && content.calc.steps || []).forEach(function (st) {
    const chosen = sel[st.id];
    // Do not assume a radio/multi shape: legacy leads may store arrays for either.
    const ids = Array.isArray(chosen) ? chosen : (chosen ? [chosen] : []);
    ids.forEach(function (id) {
      const item = (st.items || []).find(x => x.id === id);
      const target = 'calc:' + st.id + ':' + id;
      if (!item) {
        missing.push({
          article: String(st.id + '-' + id).toUpperCase(),
          name: st.name + ' · ' + id, unit: 'шт.', qty: 1, price: 0,
          note: 'Позиция выбрана в заявке, но отсутствует в актуальном каталоге. Укажите артикул и цену вручную.'
        });
        return;
      }
      const fallbackArticle = item.article || item.sku || item.code || (st.id + '-' + item.id).toUpperCase();
      const basePrice = priceForTarget(target, item.price);
      const dimensions = estimateDimensionMetrics(lead.config && lead.config.dimensions || {}, content.calc && content.calc.dimensions || {});
      const calculated = estimatePricing(item, basePrice, dimensions);
      const noteParts = [];
      if (item.note) noteParts.push(item.note);
      if (item.price == null) noteParts.push('Цена не задана в каталоге — подтвердить вручную');
      if (calculated.note) noteParts.push(calculated.note);
      rows.push({
        article: articleForTarget(target, fallbackArticle),
        name: st.name + ' · ' + item.name,
        unit: calculated.unit, qty: calculated.qty,
        price: calculated.price,
        note: noteParts.join(' · ')
      });
    });
  });

  if (!rows.length && !missing.length) rows.push({
    article: 'LEAD-' + lead.id,
    name: 'Предварительный расчёт по заявке №' + lead.id,
    unit: 'комплект', qty: 1,
    price: lead.price == null ? 0 : Number(lead.price),
    note: lead.config && lead.config.summary || lead.comment || ''
  });
  if (missing.length) {
    const knownTotal = rows.reduce((n, x) => n + Number(x.qty || 0) * Number(x.price || 0), 0);
    const residual = lead.price == null ? 0 : Math.max(0, Number(lead.price) - knownTotal);
    if (missing.length === 1 && residual > 0) {
      missing[0].price = residual;
      missing[0].note = 'Позиция отсутствует в текущем каталоге. Сумма восстановлена из заявки; проверьте артикул и цену перед отправкой клиенту.';
    } else if (missing.length > 1 && residual > 0) {
      rows.push({
        article: 'ADJUST-' + lead.id,
        name: 'Корректировка до суммы заявки', unit: 'комплект', qty: 1, price: residual,
        note: 'В каталоге не найдены: ' + missing.map(x => x.name).join(', ') + '. Сумму нужно разнести по позициям вручную.'
      });
    }
    rows.push.apply(rows, missing);
  }

  const total = rows.reduce((n, x) => n + Number(x.qty || 0) * Number(x.price || 0), 0);
  const notes = String((lead.config && lead.config.summary) || lead.comment || '').slice(0, 3000);

  // Rebuild an existing draft when the button is clicked again, so stale prices/rows never survive.
  const prev = await q(`select id, public_token from estimates where lead_id=$1 and status='draft' order by id desc limit 1`, [lead.id]);
  if (prev.rows[0]) {
    const updated = await q(`update estimates
      set client_name=$1, client_phone=$2, items=$3::jsonb, total=$4, discount=0, notes=$5, updated_at=now()
      where id=$6
      returning *`, [lead.name || '', lead.phone || '', JSON.stringify(rows), total, notes, prev.rows[0].id]);
    await q(`update leads set history=history || $1::jsonb where id=$2`,
      [JSON.stringify([{at:new Date().toISOString(),t:'черновик сметы №'+updated.rows[0].id+' пересчитан по актуальному каталогу',by:String(by || 'система')}]), lead.id]);
    return updated.rows[0];
  }

  const token = crypto.randomBytes(24).toString('hex');
  const created = await q(`insert into estimates(lead_id,client_name,client_phone,items,total,discount,notes,status,public_token,created_by)
    values($1,$2,$3,$4,$5,0,$6,'draft',$7,$8) returning *`,
    [lead.id, lead.name || '', lead.phone || '', JSON.stringify(rows), total, notes, token, String(by || 'Telegram').slice(0,80)]);
  await q(`update leads set history=history || $1::jsonb where id=$2`,
    [JSON.stringify([{at:new Date().toISOString(),t:'создана смета №'+created.rows[0].id+' по актуальному каталогу',by:String(by || 'система')}]), lead.id]);
  return created.rows[0];
}

module.exports = { q, init, getContent, getSiteContent, getPriceBook, applySitePriceBook, saveContent, publicContent, merge, checkLogin, setPassword, session, setSession, clearSession,
  log, body, send, fail, requireAdmin, tg, tgSecret, leadText, leadKeyboard, createEstimateFromLead, esc, ip, DEFAULTS };
