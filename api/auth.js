/* Вход в админку: POST {login,password} · GET — кто вошёл · DELETE — выход · PATCH {password,newLogin?} — смена пароля */
const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') { const s = L.session(req); return L.send(res, s ? 200 : 401, { ok: !!s, user: s ? s.u : null }); }
    if (req.method === 'DELETE') { const s = L.session(req); if (s) await L.log(req, 'Выход', s.u); L.clearSession(res); return L.send(res, 200, { ok: true }); }
    if (req.method === 'POST') {
      await L.init();
      const fails = await L.q(`select count(*)::int n from admin_log where action='Вход' and ok=false and ip=$1 and at > now() - interval '15 minutes'`, [L.ip(req)]);
      if (fails.rows[0].n >= 8) { await L.log(req, 'Вход', 'заблокирован на 15 минут', false); return L.send(res, 429, { ok: false, error: 'Слишком много попыток. Подождите 15 минут.' }); }
      const b = L.body(req), login = String(b.login || '').trim();
      if (await L.checkLogin(login, String(b.password || ''))) {
        L.setSession(res, login); await L.log(req, 'Вход', login, true);
        return L.send(res, 200, { ok: true, user: login });
      }
      await L.log(req, 'Вход', 'неверный логин/пароль: ' + login, false);
      return L.send(res, 401, { ok: false, error: 'Неверный логин или пароль' });
    }
    if (req.method === 'PATCH') {
      const s = await L.requireAdmin(req, res); if (!s) return;
      const b = L.body(req), pw = String(b.password || ''), login = String(b.login || s.u).trim();
      if (pw.length < 8) return L.send(res, 400, { ok: false, error: 'Пароль — минимум 8 символов' });
      await L.setPassword(login, pw); await L.log(req, 'Смена пароля', login);
      L.setSession(res, login);
      return L.send(res, 200, { ok: true, user: login });
    }
    L.send(res, 405, { ok: false });
  } catch (e) { L.fail(res, e); }
};
