/* Загрузка фото (только админ): POST {data:'data:image/webp;base64,...'} → {url} · DELETE ?id= */
const L = require('./_lib');
const OK = { 'image/webp': 1, 'image/jpeg': 1, 'image/png': 1 };
module.exports = async (req, res) => {
  try {
    const s = await L.requireAdmin(req, res); if (!s) return;
    await L.init();
    if (req.method === 'POST') {
      const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(String(L.body(req).data || ''));
      if (!m || !OK[m[1]]) return L.send(res, 400, { ok: false, error: 'Нужна картинка webp/jpeg/png' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3.5 * 1024 * 1024) return L.send(res, 413, { ok: false, error: 'Фото больше 3,5 МБ' });
      const r = await L.q(`insert into images(mime,data) values($1,$2) returning id`, [m[1], buf]);
      await L.log(req, 'Загрузка фото', '№' + r.rows[0].id + ' · ' + Math.round(buf.length / 1024) + ' КБ');
      return L.send(res, 200, { ok: true, id: r.rows[0].id, url: '/api/img?id=' + r.rows[0].id });
    }
    if (req.method === 'DELETE') {
      const id = parseInt((req.query && req.query.id) || '0', 10);
      await L.q(`delete from images where id=$1`, [id]); await L.log(req, 'Удаление фото', '№' + id);
      return L.send(res, 200, { ok: true });
    }
    L.send(res, 405, { ok: false });
  } catch (e) { L.fail(res, e); }
};
