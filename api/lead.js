/* Заявки: POST — с сайта (сохраняем в базу + шлём в Telegram) · GET — список (админ) · PATCH {id,status} (админ) */
const L = require('./_lib');
const { makeLeadDocx } = require('./_lead-docx');
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
            reply_markup: L.leadKeyboard(lead.id) });
          if (m.ok) {
            sent = true;
            await L.q(`update leads set tg_msg_id=$1 where id=$2`, [m.result.message_id, lead.id]);
            try {
              const doc = await makeLeadDocx(lead);
              const form = new FormData();
              form.append('chat_id', String(t.chat));
              form.append('document', new Blob([doc], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'lead-' + lead.id + '.docx');
              const upload = await fetch('https://api.telegram.org/bot' + t.token + '/sendDocument', { method: 'POST', body: form });
              const result = await upload.json();
              if (!result.ok) await L.log(req, 'Telegram DOCX', 'заявка №' + lead.id + ': ' + (result.description || 'ошибка отправки документа'), false);
            } catch (docError) {
              await L.log(req, 'Telegram DOCX', 'заявка №' + lead.id + ': ' + String(docError && docError.message || docError), false);
            }
          }
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
      const changed = await L.q(`update leads set status=$1, history = history || $2::jsonb where id=$3 returning *`,
        [st, JSON.stringify([{ at: new Date().toISOString(), t: st, by: s.u }]), b.id]);
      if (!changed.rows[0]) return L.send(res, 404, { ok:false, error:'Заявка не найдена' });
      const updatedLead = changed.rows[0];
      let telegramSync = null, telegramError = '';
      try {
        const c = await L.getContent(), t = c.telegram || {};
        if (t.enabled && t.token && t.chat && updatedLead.tg_msg_id) {
          const tgResult = await L.tg(t.token, 'editMessageText', {
            chat_id:t.chat, message_id:updatedLead.tg_msg_id,
            text:L.leadText(updatedLead), parse_mode:'HTML', disable_web_page_preview:true,
            reply_markup:L.leadKeyboard(updatedLead.id)
          });
          telegramSync = !!tgResult.ok;
          if (!tgResult.ok) {
            telegramError = String(tgResult.description || 'Telegram отклонил обновление сообщения');
            await L.log(req, 'Telegram sync', 'заявка №' + b.id + ': ' + telegramError, false);
          }
        }
      } catch (e) {
        telegramSync = false;
        telegramError = String(e && e.message || e || 'Ошибка Telegram');
        await L.log(req, 'Telegram sync', 'заявка №' + b.id + ': ' + telegramError, false);
      }
      await L.log(req, 'Статус заявки', '№' + b.id + ' → ' + st + (telegramSync === false ? ' · Telegram sync failed' : ''));
      return L.send(res, 200, { ok: true, lead:updatedLead, telegramSync:telegramSync, telegramError:telegramError });
    }
    if (req.method === 'DELETE') {
      const id = parseInt((req.query && req.query.id) || '0', 10);
      await L.q(`delete from leads where id=$1`, [id]); await L.log(req, 'Удаление заявки', '№' + id);
      return L.send(res, 200, { ok: true });
    }
    L.send(res, 405, { ok: false });
  } catch (e) { L.fail(res, e); }
};
