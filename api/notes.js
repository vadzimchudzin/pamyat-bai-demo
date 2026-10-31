/* Общие заметки команды: доступны только сотрудникам с активной сессией админки. */
const L = require('./_lib');

function cleanTitle(value) {
  return String(value == null ? '' : value).split(String.fromCharCode(0)).join('').trim().slice(0, 160);
}
function cleanBody(value) {
  return String(value == null ? '' : value).split(String.fromCharCode(0)).join('').slice(0, 20000);
}
function noteRow(row) {
  return row ? {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: Number(row.version || 1)
  } : null;
}

module.exports = async (req, res) => {
  try {
    const session = await L.requireAdmin(req, res);
    if (!session) return;
    await L.init();

    if (req.method === 'GET') {
      const result = await L.q('select id,title,body,created_by,updated_by,created_at,updated_at,version from team_notes order by updated_at desc,id desc limit 500');
      return L.send(res, 200, { ok: true, notes: result.rows.map(noteRow) });
    }

    if (req.method === 'POST') {
      const b = L.body(req);
      const title = cleanTitle(b.title) || 'Новая заметка';
      const body = cleanBody(b.body);
      const result = await L.q(
        'insert into team_notes(title,body,created_by,updated_by) values($1,$2,$3,$3) returning id,title,body,created_by,updated_by,created_at,updated_at,version',
        [title, body, String(session.u || '').slice(0, 80)]
      );
      const note = noteRow(result.rows[0]);
      await L.log(req, 'Общие заметки', 'создана заметка №' + note.id + ' · ' + session.u);
      return L.send(res, 201, { ok: true, note });
    }

    if (req.method === 'PUT') {
      const b = L.body(req);
      const id = Number.parseInt(b.id, 10);
      const version = Number.parseInt(b.version, 10);
      const title = cleanTitle(b.title);
      const body = cleanBody(b.body);
      if (!Number.isInteger(id) || id < 1 || !Number.isInteger(version) || version < 1) {
        return L.send(res, 400, { ok: false, error: 'Некорректный номер или версия заметки' });
      }
      if (!title) return L.send(res, 400, { ok: false, error: 'Укажите заголовок заметки' });

      const updated = await L.q(
        'update team_notes set title=$1,body=$2,updated_by=$3,updated_at=now(),version=version+1 where id=$4 and version=$5 returning id,title,body,created_by,updated_by,created_at,updated_at,version',
        [title, body, String(session.u || '').slice(0, 80), id, version]
      );
      if (!updated.rows[0]) {
        const latest = await L.q('select id,title,body,created_by,updated_by,created_at,updated_at,version from team_notes where id=$1', [id]);
        if (!latest.rows[0]) return L.send(res, 404, { ok: false, error: 'Заметка не найдена' });
        return L.send(res, 409, { ok: false, error: 'Заметку уже изменил другой сотрудник', note: noteRow(latest.rows[0]) });
      }
      const note = noteRow(updated.rows[0]);
      await L.log(req, 'Общие заметки', 'изменена заметка №' + note.id + ' · ' + session.u);
      return L.send(res, 200, { ok: true, note });
    }

    if (req.method === 'DELETE') {
      const id = Number.parseInt((req.query && req.query.id) || '0', 10);
      const version = Number.parseInt((req.query && req.query.version) || '0', 10);
      if (!Number.isInteger(id) || id < 1 || !Number.isInteger(version) || version < 1) {
        return L.send(res, 400, { ok: false, error: 'Некорректный номер или версия заметки' });
      }
      const deleted = await L.q('delete from team_notes where id=$1 and version=$2 returning id', [id, version]);
      if (!deleted.rows[0]) {
        const latest = await L.q('select id,title,body,created_by,updated_by,created_at,updated_at,version from team_notes where id=$1', [id]);
        if (!latest.rows[0]) return L.send(res, 404, { ok: false, error: 'Заметка не найдена' });
        return L.send(res, 409, { ok: false, error: 'Заметку уже изменил другой сотрудник', note: noteRow(latest.rows[0]) });
      }
      await L.log(req, 'Общие заметки', 'удалена заметка №' + id + ' · ' + session.u);
      return L.send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return L.send(res, 405, { ok: false, error: 'Метод не поддерживается' });
  } catch (e) {
    return L.fail(res, e);
  }
};
