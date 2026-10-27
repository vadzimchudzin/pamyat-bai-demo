/* Заявки: POST — с сайта (сохраняем в базу + шлём в Telegram) · GET — список (админ) · PATCH {id,status} (админ) */
const L = require('./_lib');
const STATUSES = ['новая', 'взята в работу', 'связались', 'назначен замер', 'отправлена смета', 'заключён договор', 'отказ', 'завершена'];
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
module.exports = async (req, res) => {
  try {
    await L.init();
    if (req.method === 'POST') {
      const b = L.body(req);
      const name = clean(b.name, 80), phone = clean(b.phone, 40);
      if (!phone || phone.replace(/\D/g, '').length < 7) return L.send(res, 400, { ok: false, error: 'Укажите телефон' });
      const recent = await L.q(`select count(*)::int n from leads where phone=$1 and created_at > now() - interval '1 minute'`, [phone]);
      if (recent.rows[0].n >= 3) return L.send(res, 429, { ok: false, error: 'Заявка уже отправлена' });
      const r = await L.q(`insert into leads(type,name,phone,comment,price,config,source,history) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [clean(b.type, 20) || 'contact', name, phone, clean(b.comment, 1000), Number.isFinite(+b.price) && b.price !== null ? Math.round(+b.price) : null,
         JSON.stringify(b.config || null), clean(b.source, 300), JSON.stringify([{ at: new Date().toISOString(), t: 'создана' }])]);
      const lead = r.rows[0];
      let sent = false;
      try {
        const c = await L.getContent(), t = c.telegram || {};
        if (t.enabled && t.token && t.chat) {
          const m = await L.tg(t.token, 'sendMessage', { chat_id: t.chat, text: L.leadText(lead), parse_mode: 'HTML', disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[{ text: '✅ Взять в работу', callback_data: 'take:' + lead.id }, { text: '✖️ Пропустить', callback_data: 'skip:' + lead.id }]] } });
          if (m.ok) { sent = true; await L.q(`update leads set tg_msg_id=$1 where id=$2`, [m.result.message_id, lead.id]); }
        }
      } catch (e) { /* заявка уже в базе — Telegram не критичен */ }
      return L.send(res, 200, { ok: true, id: lead.id, telegram: sent });
    }
    const s = await L.requireAdmin(req, res); if (!s) return;
    if (req.method === 'GET') {
      const r = await L.q(`select * from leads order by id desc limit 500`);
      return L.send(res, 200, { ok: true, leads: r.rows, statuses: STATUSES });
    }
    if (req.method === 'PATCH') {
      const b = L.body(req), st = String(b.status || '');
      if (STATUSES.indexOf(st) < 0) return L.send(res, 400, { ok: false, error: 'Неизвестный статус' });
      await L.q(`update leads set status=$1, history = history || $2::jsonb where id=$3`, [st, JSON.stringify([{ at: new Date().toISOString(), t: st, by: s.u }]), b.id]);
      await L.log(req, 'Статус заявки', '№' + b.id + ' → ' + st);
      return L.send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      const id = parseInt((req.query && req.query.id) || '0', 10);
      await L.q(`delete from leads where id=$1`, [id]); await L.log(req, 'Удаление заявки', '№' + id);
      return L.send(res, 200, { ok: true });
    }
    L.send(res, 405, { ok: false });
  } catch (e) { L.fail(res, e); }
};
