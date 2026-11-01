/* Запасной путь для фото работ: /api/work-img?u=<https://....neon.tech/...>
   Нужен, когда браузер не может загрузить фото напрямую с внешнего хранилища. */
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
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4 * 1024 * 1024) { res.statusCode = 413; return res.end('too large'); }
    res.statusCode = 200;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.end(buf);
  } catch (e) {
    res.statusCode = 502; res.end('error');
  }
};
