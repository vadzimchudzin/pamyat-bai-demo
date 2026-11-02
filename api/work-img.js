/* Запасной путь для фото работ: /api/work-img?u=<https://....neon.tech/...>
   Нужен, когда браузер не может загрузить фото напрямую с внешнего хранилища.
   &w=ширина — уменьшенная копия (webp): карусель работ грузит ~100–200 КБ вместо ~1 МБ. */
const R = require('./_resize');
module.exports = async (req, res) => {
  try {
    const raw = String((req.query && req.query.u) || '');
    let u;
    try { u = new URL(raw); } catch (e) { res.statusCode = 400; return res.end('bad url'); }
    if (u.protocol !== 'https:' || !/(^|\.)neon\.tech$/i.test(u.hostname)) { res.statusCode = 400; return res.end('host not allowed'); }
    const r = await fetch(u, { redirect: 'error' });
    if (!r.ok) { res.statusCode = 502; return res.end('upstream ' + r.status); }
    const type = r.headers.get('content-type') || '';
    if (!/^image\//i.test(type)) { res.statusCode = 400; return res.end('not an image'); }
    let buf = Buffer.from(await r.arrayBuffer()), ctype = type;
    if (buf.length > 12 * 1024 * 1024) { res.statusCode = 413; return res.end('too large'); }
    const width = R.pickWidth(req.query && req.query.w);
    if (width) ({ buf, type: ctype } = await R.resize(buf, type, width));
    else if (buf.length > 4 * 1024 * 1024) { res.statusCode = 413; return res.end('too large'); }
    res.statusCode = 200;
    res.setHeader('Content-Type', ctype);
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000');
    res.end(buf);
  } catch (e) {
    res.statusCode = 502; res.end('error');
  }
};
