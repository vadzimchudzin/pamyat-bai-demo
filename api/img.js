/* Отдача загруженных фото: /api/img?id=N */
const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    const id = parseInt((req.query && req.query.id) || '0', 10);
    await L.init();
    const r = await L.q(`select mime, data from images where id=$1`, [id]);
    if (!r.rows[0]) { res.statusCode = 404; return res.end('not found'); }
    res.statusCode = 200; res.setHeader('Content-Type', r.rows[0].mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(Buffer.from(r.rows[0].data));
  } catch (e) { L.fail(res, e); }
};
