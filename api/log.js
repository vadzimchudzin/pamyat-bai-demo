/* Журнал действий и входов (только админ) */
const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    const s = await L.requireAdmin(req, res); if (!s) return;
    await L.init();
    const r = await L.q(`select id, at, action, detail, ip, ok from admin_log order by id desc limit 300`);
    L.send(res, 200, { ok: true, log: r.rows });
  } catch (e) { L.fail(res, e); }
};
