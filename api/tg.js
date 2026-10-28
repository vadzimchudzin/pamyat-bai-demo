/* Telegram: таблица заявки, управление статусом и создание смет кнопками в группе. */
const L = require('./_lib');
const { makeEstimateDocx } = require('./_estimate-docx');
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
  const rows = Array.isArray(e.items) ? e.items : (typeof e.items === 'string' ? JSON.parse(e.items || '[]') : []);
  function fit(value, width) {
    const text = String(value == null ? '—' : value).replace(/[\\r\\n]+/g, ' ').trim();
    const chars = Array.from(text);
    const short = chars.length > width ? chars.slice(0,width-1).join('') + '…' : text;
    return short + ' '.repeat(Math.max(0,width-Array.from(short).length));
  }
  const widths = [3, 27, 6, 7, 12, 12];
  const headers = ['№','Позиция','Ед.','Кол-во','Цена','Сумма'];
  const tableRows = rows.slice(0, 16).map((x,i)=>[
    String(i+1),x.name || 'Позиция',x.unit || 'шт.',
    Number(x.qty || 0).toLocaleString('ru-RU',{maximumFractionDigits:2}),
    money(x.price),money(Number(x.qty || 0)*Number(x.price || 0))
  ]);
  function line(row) { return '│ ' + row.map((x,i)=>fit(x,widths[i])).join(' │ ') + ' │'; }
  const top = '┌' + widths.map(w=>'─'.repeat(w+2)).join('┬') + '┐';
  const mid = '├' + widths.map(w=>'─'.repeat(w+2)).join('┼') + '┤';
  const bottom = '└' + widths.map(w=>'─'.repeat(w+2)).join('┴') + '┘';
  const nl = String.fromCharCode(10);
  const printedRows = [top,line(headers),mid].concat(tableRows.map(line));
  if (rows.length > tableRows.length) printedRows.push('… см. полную таблицу в Word-файле');
  printedRows.push(bottom);
  const subtotal = rows.reduce((sum,x)=>sum+Number(x.qty || 0)*Number(x.price || 0),0);
  const discount = Math.min(subtotal,Math.max(0,Number(e.discount || 0)));
  const total = Math.max(0,subtotal-discount);
  const lines = [
    '<b>ПАМЯТЬ.БАЙ · СМЕТА №' + e.id + '</b>',
    '<pre>' + L.esc(printedRows.join(nl)) + '</pre>',
    '<b>Клиент:</b> ' + L.esc(e.client_name || '—'),
    '<b>Телефон:</b> ' + L.esc(e.client_phone || '—'),
    '<b>Сумма позиций:</b> ' + money(subtotal),
    '<b>Скидка:</b> ' + money(discount),
    '<b>ИТОГО:</b> ' + money(total)
  ];
  if (e.notes) lines.push('<b>Примечание:</b> ' + L.esc(String(e.notes).slice(0,500)));
  return lines.join(nl);
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
        let docSent = false, docError = '';
        if (sent.ok) {
          try {
            const doc = await makeEstimateDocx(e, c.contacts || {});
            const form = new FormData();
            form.append('chat_id', String(cb.message.chat.id));
            form.append('document', new Blob([doc], { type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'smeta-' + e.id + '.docx');
            const upload = await fetch('https://api.telegram.org/bot' + t.token + '/sendDocument', { method:'POST', body:form });
            const result = await upload.json();
            docSent = !!result.ok;
            if (!docSent) docError = result.description || 'Telegram не принял Word-файл';
          } catch (error) { docError = String(error && error.message || error); }
        }
        await L.tg(t.token, 'answerCallbackQuery', { callback_query_id:cb.id, text:sent.ok ? (docSent ? ('Смета №' + e.id + ' и Word-файл отправлены') : ('Смета отправлена, DOCX: ' + docError.slice(0,100))) : 'Не удалось отправить смету' });
        await L.log(req, 'Telegram', 'смета №' + e.id + ' по заявке №' + estimateMatch[1] + ': сообщение ' + (sent.ok?'ок':'ошибка') + ', Word ' + (docSent?'ок':docError || 'не отправлен') + ' · ' + who, sent.ok && docSent);
        return L.send(res,200,{ok:true,document:docSent});
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
