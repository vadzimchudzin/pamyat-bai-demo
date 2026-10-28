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
  const time = new Date(L.created_at || Date.now()).toLocaleDateString('ru-RU', { timeZone: 'Europe/Minsk' });
  function col(value, width) {
    const text = String(value == null ? '—' : value).replace(/[\r\n]+/g, ' ').trim();
    const chars = Array.from(text);
    const short = chars.length > width ? chars.slice(0, width - 1).join('') + '…' : text;
    return short + ' '.repeat(Math.max(0, width - Array.from(short).length));
  }
  const type = L.type === 'calc' ? 'Расчёт' : 'Звонок';
  const amount = L.price == null ? 'инд.' : Number(L.price).toLocaleString('ru-RU') + ' BYN';
  const widths = [4, 10, 14, 16, 14, 15];
  const headers = ['№','Дата','Клиент','Телефон','Сумма','Статус'];
  const values = [String(L.id),time,L.name || '—',L.phone || '—',amount,L.status || 'новая'];
  const line = row => '│ ' + row.map((x,i)=>col(x,widths[i])).join(' │ ') + ' │';
  const bar = '├' + widths.map(w=>'─'.repeat(w+2)).join('┼') + '┤';
  const top = '┌' + widths.map(w=>'─'.repeat(w+2)).join('┬') + '┐';
  const bottom = '└' + widths.map(w=>'─'.repeat(w+2)).join('┴') + '┘';
  const lines = [
    '<b>ПАМЯТЬ.БАЙ · НОВАЯ ЗАЯВКА №' + L.id + '</b>',
    '<pre>' + esc([top,line(headers),bar,line(values),bottom].join('\\n')) + '</pre>',
    '<b>Тип:</b> ' + esc(type)
  ];
  if (L.config && L.config.summary) lines.push('<b>Состав расчёта</b>', '<pre>' + esc(String(L.config.summary).slice(0, 1500)) + '</pre>');
  if (L.comment) lines.push('<b>Комментарий:</b> ' + esc(String(L.comment).slice(0, 700)));
  if (L.taken_by) lines.push('<b>Ответственный:</b> ' + esc(L.taken_by));
  return lines.join('\\n');
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
    const price = Math.max(0, Math.round(Number(p.price)));
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
function leadKeyboard(id) {
  return { inline_keyboard: [
    [{ text: '✅ Взять в работу', callback_data: 'take:' + id }, { text: '🧾 Получить смету', callback_data: 'quote:' + id }],
    [{ text: '📞 Связались', callback_data: 'status:c:' + id }, { text: '📐 Назначить замер', callback_data: 'status:m:' + id }],
    [{ text: '📄 Смета отправлена', callback_data: 'status:q:' + id }, { text: '🤝 Договор', callback_data: 'status:d:' + id }],
    [{ text: '✔️ Завершена', callback_data: 'status:f:' + id }, { text: '✖️ Отказ', callback_data: 'skip:' + id }]
  ] };
}
async function createEstimateFromLead(leadId, by) {
  await init();
  const prev = await q(`select * from estimates where lead_id=$1 and status='draft' order by id desc limit 1`, [leadId]);
  if (prev.rows[0]) return prev.rows[0];
  const leadResult = await q(`select * from leads where id=$1 limit 1`, [leadId]);
  const lead = leadResult.rows[0];
  if (!lead) throw Object.assign(new Error('Заявка не найдена'), { code: 'NO_LEAD' });
  const content = await getSiteContent();
  const sel = lead.config && lead.config.sel && typeof lead.config.sel === 'object' ? lead.config.sel : {};
  const rows = [];
  const catalog = content.catalog || { categories: [], items: [] };
  const categoryId = sel.monument || '';
  const category = (catalog.categories || []).find(x => x.id === categoryId);
  if (category) {
    const modelCode = lead.config && lead.config.model;
    const model = modelCode && (catalog.items || []).find(x => x.code === modelCode);
    rows.push({ name: category.name + (model ? ' · модель ' + model.code : ''), unit: 'комплект', qty: 1,
      price: category.price == null ? 0 : Number(category.price), note: category.price == null ? 'Индивидуальный расчёт' : '' });
  }
  (content.calc && content.calc.steps || []).forEach(function (st) {
    const chosen = sel[st.id];
    const ids = st.type === 'multi' ? (Array.isArray(chosen) ? chosen : []) : (chosen ? [chosen] : []);
    ids.forEach(function (id) {
      const item = (st.items || []).find(x => x.id === id);
      if (!item) return;
      rows.push({ name: st.name + ' · ' + item.name, unit: 'шт.', qty: 1,
        price: item.price == null ? 0 : Number(item.price), note: item.note || (item.price == null ? 'Индивидуальный расчёт' : '') });
    });
  });
  if (!rows.length) rows.push({ name: 'Предварительный расчёт по заявке №' + lead.id, unit: 'комплект', qty: 1,
    price: lead.price == null ? 0 : Number(lead.price), note: lead.config && lead.config.summary || lead.comment || '' });
  const total = rows.reduce((n, x) => n + Number(x.qty || 0) * Number(x.price || 0), 0);
  const token = crypto.randomBytes(24).toString('hex');
  const res = await q(`insert into estimates(lead_id,client_name,client_phone,items,total,discount,notes,status,public_token,created_by)
    values($1,$2,$3,$4,$5,0,$6,'draft',$7,$8) returning *`,
    [lead.id, lead.name || '', lead.phone || '', JSON.stringify(rows), total, String((lead.config && lead.config.summary) || lead.comment || ''), token, String(by || 'Telegram').slice(0,80)]);
  await q(`update leads set history=history || $1::jsonb where id=$2`,
    [JSON.stringify([{at:new Date().toISOString(),t:'создан черновик сметы №'+res.rows[0].id,by:String(by || 'система')}]), lead.id]);
  return res.rows[0];
}


module.exports = { q, init, getContent, getSiteContent, getPriceBook, applySitePriceBook, saveContent, publicContent, merge, checkLogin, setPassword, session, setSession, clearSession,
  log, body, send, fail, requireAdmin, tg, tgSecret, leadText, leadKeyboard, createEstimateFromLead, esc, ip, DEFAULTS };
