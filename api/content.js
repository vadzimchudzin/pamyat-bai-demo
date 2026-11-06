/* Содержимое сайта: GET — для всех (без токена бота) · PUT — сохранить (только админ) */
const L = require('./_lib');
module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const full = !!(L.session(req) && req.query && req.query.full);
      const c = full ? await L.getContent() : await L.getSiteContent();
      if (full) return L.send(res, 200, { ok: true, content: c, versions: L.contentVersions(c) });
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: true, content: L.publicContent(c) }));
    }
    if (req.method === 'PUT') {
      const s = await L.requireAdmin(req, res); if (!s) return;
      const b = L.body(req);
      const result = await L.saveContentSection(b.section, b.value, b.expectedVersion);
      if (result.invalid) return L.send(res, 400, { ok: false, error: 'Обновите страницу админки и повторите сохранение.' });
      if (result.conflict) return L.send(res, 409, { ok: false, error: 'Этот раздел уже изменён в другой вкладке. Ваши правки не сохранены: скопируйте их, обновите страницу и внесите заново.' });
      // Logging is best effort: a log failure must not report a committed save as failed.
      try { await L.log(req, 'Изменение сайта', b.section + ' · ' + s.u); } catch (e) { console.error('Не удалось записать журнал', e); }
      return L.send(res, 200, { ok: true, content: result.content, versions: result.versions });
    }
    L.send(res, 405, { ok: false });
  } catch (e) { L.fail(res, e); }
};
