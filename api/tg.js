/* Telegram: таблица заявки, управление статусом и создание смет кнопками в группе. */
const L = require('./_lib');
const { makeEstimateDocx } = require('./_estimate-docx');
const { quoteText, quoteKeyboard, statusLabel } = require('./_estimate-telegram');
const STATUS_BY_CODE = {
  n:'новая',
  w:'взята в работу',
  c:'связались',
  m:'назначен замер',
  q:'отправлена смета',
  d:'заключён договор',
  x:'отказ',
  f:'завершена'
};
function whoFrom(cb) {
  return cb.from && cb.from.username ? '@' + cb.from.username :
    [cb.from && cb.from.first_name, cb.from && cb.from.last_name].filter(Boolean).join(' ') || 'Telegram';
}
module.exports = async (req, res) => {
  try {
    const action = req.query && req.query.action;
    if (!action) {
      if (req.headers['x-telegram-bot-api-secret-token'] !== L.tgSecret()) return L.send(res, 403, { ok:false });
      const c = await L.getContent(), t = c.telegram || {}, up = L.body(req), cb = up.callback_query;
      if (!cb || !t.token) return L.send(res, 200, { ok:true });
      const who = whoFrom(cb);
      const data = String(cb.data || '');
      const estimateMatch = /^quote:(\d+)$/.exec(data);
      if (estimateMatch) {
        const e = await L.createEstimateFromLead(Number(estimateMatch[1]), who);
        const leadResult = e.lead_id ? await L.q('select status from leads where id=$1 limit 1', [e.lead_id]) : {rows:[]};
        const leadStatus = leadResult.rows[0] ? leadResult.rows[0].status : '';
        const text = quoteText(e, leadStatus);
        const messageArgs = { chat_id: cb.message.chat.id, text, parse_mode:'HTML', disable_web_page_preview:true, reply_markup:quoteKeyboard(e) };
        let sent;
        if (e.telegram_message_id && e.telegram_chat_id) {
          sent = await L.tg(t.token, 'editMessageText', Object.assign({}, messageArgs, {
            chat_id:e.telegram_chat_id, message_id:e.telegram_message_id
          }));
          if (!sent.ok && /message is not modified/i.test(String(sent.description || ''))) {
            sent = {ok:true,result:{message_id:e.telegram_message_id}};
          } else if (!sent.ok) {
            sent = await L.tg(t.token, 'sendMessage', messageArgs);
          }
        } else {
          sent = await L.tg(t.token, 'sendMessage', messageArgs);
        }
        if (sent.ok) {
          const messageId = sent.result && sent.result.message_id ? sent.result.message_id : e.telegram_message_id;
          const chatId = e.telegram_chat_id || String(cb.message.chat.id);
          if (messageId) await L.q('update estimates set telegram_message_id=$1, telegram_chat_id=$2 where id=$3', [messageId, String(chatId), e.id]);
        }
        let docSent = false, docError = '';
        if (sent.ok) {
          try {
            const doc = await makeEstimateDocx(e, c.contacts || {});
            const form = new FormData();
            form.append('chat_id', String(cb.message.chat.id));
            form.append('document', new Blob([doc], { type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'smeta-' + e.id + '.docx');
            const upload = await fetch('https://api.telegram.org/bot' + t.token + '/sendDocument', { method: 'POST', body: form });
            const result = await upload.json();
            docSent = !!result.ok;
            if (!docSent) docError = result.description || 'Telegram не принял Word-файл';
          } catch (error) { docError = String(error && error.message || error); }
        }
        await L.tg(t.token, 'answerCallbackQuery', { callback_query_id:cb.id, text:sent.ok ? (docSent ? ('Смета №' + e.id + ' и Word-файл отправлены') : ('Смета отправлена, DOCX: ' + docError.slice(0,100))) : 'Не удалось отправить смету' });
        await L.log(req, 'Telegram', 'смета №' + e.id + ' по заявке №' + estimateMatch[1] + ': сообщение ' + (sent.ok?'ок':'ошибка') + ', Word ' + (docSent?'ок':docError || 'не отправлен') + ' · ' + who, sent.ok && docSent);
        return L.send(res,200,{ok:true,document:docSent});
      }

      const quoteStatusMatch = /^quote-status:(sent|approved|rejected):(\d+)$/.exec(data);
      if (quoteStatusMatch) {
        const estimateId = Number(quoteStatusMatch[2]);
        const newEstimateStatus = quoteStatusMatch[1];
        const changedEstimate = await L.q('update estimates set status=$1, updated_at=now() where id=$2 returning *', [newEstimateStatus, estimateId]);
        if (!changedEstimate.rows[0]) {
          await L.tg(t.token, 'answerCallbackQuery', {callback_query_id:cb.id,text:'Смета не найдена'});
          return L.send(res,200,{ok:true});
        }
        const estimate = changedEstimate.rows[0];
        let updatedLead = null;
        if (estimate.lead_id) {
          const leadChange = await L.q('update leads set status=$1, history=history || $2::jsonb where id=$3 returning *',
            ['отправлена смета',JSON.stringify([{at:new Date().toISOString(),t:'отправлена смета №'+estimate.id,by:who}]),estimate.lead_id]);
          updatedLead = leadChange.rows[0] || null;
        }
        const currentLeadStatus = updatedLead ? updatedLead.status : '';
        const editQuote = await L.tg(t.token,'editMessageText',{
          chat_id:cb.message.chat.id,message_id:cb.message.message_id,
          text:quoteText(estimate,currentLeadStatus),parse_mode:'HTML',disable_web_page_preview:true,
          reply_markup:quoteKeyboard(estimate)
        });
        let leadMessageUpdated = null;
        if (updatedLead && updatedLead.tg_msg_id) {
          const editLead = await L.tg(t.token,'editMessageText',{
            chat_id:t.chat || cb.message.chat.id,message_id:updatedLead.tg_msg_id,
            text:L.leadText(updatedLead),parse_mode:'HTML',disable_web_page_preview:true,
            reply_markup:L.leadKeyboard(updatedLead.id, updatedLead.status)
          });
          leadMessageUpdated = !!editLead.ok;
        }
        await L.tg(t.token,'answerCallbackQuery',{
          callback_query_id:cb.id,
          text:editQuote.ok ? 'Смета и статус заявки обновлены' : 'Статус сохранён, но сообщение сметы не обновилось'
        });
        await L.log(req,'Telegram','смета №'+estimate.id+': статус '+newEstimateStatus+' · '+who,!!editQuote.ok);
        return L.send(res,200,{ok:true,estimateUpdated:!!editQuote.ok,leadMessageUpdated:leadMessageUpdated});
      }

      let leadId = 0, st = '', actionName = '';
      const legacy = /^(take|skip):(\d+)$/.exec(data);
      const statusMatch = /^status:([nwcqdmxf]):(\d+)$/.exec(data);
      if (legacy) {
        leadId = Number(legacy[2]);
        st = legacy[1] === 'take' ? STATUS_BY_CODE.w : STATUS_BY_CODE.x;
        actionName = legacy[1];
      } else if (statusMatch) {
        leadId = Number(statusMatch[2]);
        st = STATUS_BY_CODE[statusMatch[1]];
        actionName = 'status';
      } else {
        await L.tg(t.token, 'answerCallbackQuery', { callback_query_id:cb.id, text:'Неизвестное действие' });
        return L.send(res,200,{ok:true});
      }
      const patch = await L.q(`update leads set status=$1, taken_by=$2, history = history || $3::jsonb where id=$4 returning *`,
        [st, who, JSON.stringify([{at:new Date().toISOString(),t:st,by:who}]), leadId]);
      if (!patch.rows[0]) {
        await L.tg(t.token, 'answerCallbackQuery', { callback_query_id:cb.id, text:'Заявка не найдена' });
        return L.send(res,200,{ok:true});
      }
      const lead = patch.rows[0];
      if (st === 'отправлена смета') {
        await L.q("update estimates set status='sent',updated_at=now() where lead_id=$1 and status='draft'", [leadId]);
      }
      const relatedEstimateResult = await L.q('select * from estimates where lead_id=$1 order by id desc limit 1', [leadId]);
      const relatedEstimate = relatedEstimateResult.rows[0] || null;
      if (relatedEstimate && relatedEstimate.telegram_message_id && relatedEstimate.telegram_chat_id) {
        const estimateEdit = await L.tg(t.token, 'editMessageText', {
          chat_id:relatedEstimate.telegram_chat_id,
          message_id:relatedEstimate.telegram_message_id,
          text:quoteText(relatedEstimate, lead.status),
          parse_mode:'HTML', disable_web_page_preview:true,
          reply_markup:quoteKeyboard(relatedEstimate)
        });
        if (!estimateEdit.ok) await L.log(req, 'Telegram sync', 'смета №' + relatedEstimate.id + ': ' + String(estimateEdit.description || 'не удалось обновить'), false);
      }
      let messageUpdated = false, messageError = '';
      try {
        const edit = await L.tg(t.token, 'editMessageText', {
          chat_id:cb.message.chat.id, message_id:cb.message.message_id,
          text:L.leadText(lead), parse_mode:'HTML', disable_web_page_preview:true,
          reply_markup:L.leadKeyboard(leadId, lead.status)
        });
        messageUpdated = !!edit.ok;
        if (!edit.ok) messageError = String(edit.description || 'Не удалось обновить сообщение');
      } catch (e) {
        messageError = String(e && e.message || e || 'Ошибка Telegram');
      }
      await L.tg(t.token, 'answerCallbackQuery', {
        callback_query_id:cb.id,
        text:messageUpdated ? ('Статус: ' + st) : ('Статус сохранён; сообщение не обновлено: ' + messageError.slice(0,90))
      });
      await L.log(req, 'Telegram', 'заявка №' + leadId + ': ' + st + ' · ' + who + (messageUpdated ? '' : ' · ошибка обновления: ' + messageError), messageUpdated);
      return L.send(res,200,{ok:true,messageUpdated:messageUpdated,error:messageError});
    }

    const session = await L.requireAdmin(req, res); if (!session) return;
    const c = await L.getContent(), t = c.telegram || {};
    if (!t.token) return L.send(res, 400, { ok:false, error:'Сначала укажите токен бота' });
    if (action === 'info') {
      const me = await L.tg(t.token, 'getMe', {});
      const wh = await L.tg(t.token, 'getWebhookInfo', {});
      return L.send(res, 200, { ok:me.ok, bot:me.result, webhook:wh.result, error:me.description });
    }
    if (action === 'webhook') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const r = await L.tg(t.token, 'setWebhook', { url:'https://' + host + '/api/tg', secret_token:L.tgSecret(), allowed_updates:['callback_query'] });
      await L.log(req, 'Telegram', 'подключение кнопок: ' + (r.ok ? 'ок' : r.description), r.ok);
      return L.send(res, 200, { ok:r.ok, error:r.description });
    }
    if (action === 'test') {
      if (!t.chat) return L.send(res, 400, { ok:false, error:'Укажите ID группы' });
      const r = await L.tg(t.token, 'sendMessage', { chat_id:t.chat,
        text:'<b>ПАМЯТЬ.БАЙ</b>\n<pre>Проверка связи с ботом\nЗаявки и сметы будут приходить таблицами.</pre>', parse_mode:'HTML' });
      await L.log(req, 'Telegram', 'тест: ' + (r.ok ? 'ок' : r.description), r.ok);
      return L.send(res, 200, { ok:r.ok, error:r.description });
    }
    return L.send(res, 400, { ok:false, error:'Неизвестное действие' });
  } catch (e) { return L.fail(res,e); }
};
