/* Содержимое сайта: GET — для всех (без токена бота) · PUT — сохранить (только админ) */
const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const full = !!(L.session(req) && req.query && req.query.full);
      const c = full ? await L.getContent() : await L.getSiteContent();
      if (full) return L.send(res, 200, { ok: true, content: c });
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true, content: L.publicContent(c) }));
    }
    if (req.method === 'PUT') {
      const s = await L.requireAdmin(req, res); if (!s) return;
      const b = L.body(req), cur = await L.getContent();
      const part = b.section ? { [b.section]: b.value } : (b.content || {});
      const next = L.merge(cur, part);
      await L.saveContent(next);
      await L.log(req, 'Изменение сайта', (b.section || Object.keys(part).join(', ')) + ' · ' + s.u);
      return L.send(res, 200, { ok: true, content: next });
    }
    L.send(res, 405, { ok: false });
  } catch (e) { L.fail(res, e); }
};
