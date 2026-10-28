/* Telegram: таблица заявки, управление статусом и создание смет кнопками в группе. */
const L = require('./_lib');
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
function money(v) { return Number(v || 0).toLocaleString('ru-RU') + ' BYN'; }
function quoteText(e) {
  const rows = Array.isArray(e.items) ? e.items : [];
  const table = rows.map((x, i) => {
    const sum = Number(x.qty || 0) * Number(x.price || 0);
    return (i + 1) + '. ' + String(x.name || 'Позиция').slice(0, 70) + '\n   ' +
      String(x.qty || 0) + ' ' + String(x.unit || 'шт.') + ' × ' + money(x.price) + ' = ' + money(sum) +
      (x.note ? '\n   ' + String(x.note).slice(0,100) : '');
  }).join('\n');
  return '<b>🧾 СМЕТА №' + e.id + ' · ПАМЯТЬ.БАЙ</b>\n' +
    '<pre>' + L.esc((e.client_name || 'Клиент') + '\n' + (e.client_phone || '') + '\n\n' + (table || 'Позиции не добавлены').slice(0,2400)) + '</pre>\n' +
    '<b>Итого: ' + money(e.total) + '</b>' +
    (e.notes ? '\n\n<b>Примечание:</b> ' + L.esc(String(e.notes).slice(0,500)) : '');
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
        const text = quoteText(e);
        const url = 'https://pamyat-bai-demo.vercel.app/estimate.html?token=' + encodeURIComponent(e.public_token);
        const sent = await L.tg(t.token, 'sendMessage', { chat_id: cb.message.chat.id, text, parse_mode:'HTML', disable_web_page_preview:true,
          reply_markup:{inline_keyboard:[
            [{text:'📄 Открыть смету / PDF',url:url}],
            [{text:'📤 Отметить «Смета отправлена»',callback_data:'status:q:' + e.lead_id}]
          ]}});
        await L.tg(t.token, 'answerCallbackQuery', { callback_query_id:cb.id, text:sent.ok ? ('Черновик сметы №' + e.id + ' создан') : 'Смета создана, но не удалось отправить сообщение' });
        await L.log(req, 'Telegram', 'создан черновик сметы №' + e.id + ' по заявке №' + estimateMatch[1] + ' · ' + who, sent.ok);
        return L.send(res,200,{ok:true});
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
      try {
        await L.tg(t.token, 'editMessageText', { chat_id:cb.message.chat.id, message_id:cb.message.message_id,
          text:L.leadText(lead), parse_mode:'HTML', disable_web_page_preview:true, reply_markup:L.leadKeyboard(leadId) });
      } catch (e) {}
      await L.tg(t.token, 'answerCallbackQuery', { callback_query_id:cb.id, text:'Статус: ' + st });
      await L.log(req, 'Telegram', 'заявка №' + leadId + ': ' + st + ' · ' + who);
      return L.send(res,200,{ok:true});
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
