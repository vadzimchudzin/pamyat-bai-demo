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
  const lines = ['<b>Заявка №' + L.id + '</b> · ' + esc(L.type === 'calc' ? 'расчёт' : 'звонок'),
    '👤 ' + esc(L.name || '—') + ' · ' + esc(L.phone || '—')];
  if (L.price) lines.push('💰 от ' + Number(L.price).toLocaleString('ru-RU') + ' BYN');
  if (L.config && L.config.summary) lines.push('🧱 ' + esc(L.config.summary));
  if (L.comment) lines.push('💬 ' + esc(L.comment));
  lines.push('🕒 ' + new Date(L.created_at || Date.now()).toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' }));
  if (L.source) lines.push('🔗 ' + esc(L.source));
  return lines.join('\n');
}

module.exports = { q, init, getContent, saveContent, publicContent, merge, checkLogin, setPassword, session, setSession, clearSession,
  log, body, send, fail, requireAdmin, tg, tgSecret, leadText, esc, ip, DEFAULTS };
