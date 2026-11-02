/* Отдача загруженных фото: /api/img?id=N[&w=ширина] — с ?w= отдаём уменьшенную копию (webp) */
const L = require('./_lib');
const R = require('./_resize');
module.exports = async (req, res) => {
  try {
    const id = parseInt((req.query && req.query.id) || '0', 10);
    const width = R.pickWidth(req.query && req.query.w);
    await L.init();
    const r = await L.q(`select mime, data from images where id=$1`, [id]);
    if (!r.rows[0]) { res.statusCode = 404; return res.end('not found'); }
    let buf = Buffer.from(r.rows[0].data), type = r.rows[0].mime;
    if (width) ({ buf, type } = await R.resize(buf, type, width));
    res.statusCode = 200; res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.end(buf);
  } catch (e) { L.fail(res, e); }
};
