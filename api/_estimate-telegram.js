/* Short caption for a table-photo message. Telegram text messages do not have native table layout. */
const L = require('./_lib');

function money(value) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' BYN';
}
function statusLabel(status) {
  return ({
    'новая':'Новая',
    'взята в работу':'Взята в работу',
    'связались':'Связались',
    'назначен замер':'Назначен замер',
    'отправлена смета':'Смета отправлена',
    'заключён договор':'Договор',
    'отказ':'Отказ',
    'завершена':'Завершена'
  })[status] || status || 'Новая';
}
function quoteText(estimate, leadStatus) {
  const rows = Array.isArray(estimate.items) ? estimate.items :
    (typeof estimate.items === 'string' ? JSON.parse(estimate.items || '[]') : []);
  const estimateStatus = ({draft:'Черновик',sent:'Отправлена',approved:'Согласована',rejected:'Отклонена'})[estimate.status] || estimate.status || 'Черновик';
  const subtotal = rows.reduce((sum, x) => sum + Number(x.qty || 0) * Number(x.price || 0), 0);
  const discount = Math.min(subtotal, Math.max(0, Number(estimate.discount || 0)));
  const total = Math.max(0, subtotal - discount);
  const nl = String.fromCharCode(10);
  return [
    '<b>ПАМЯТЬ.БАЙ · СМЕТА №' + L.esc(estimate.id) + '</b>',
    '<b>Статус заявки:</b> ' + L.esc(statusLabel(leadStatus)),
    '<b>Статус сметы:</b> ' + L.esc(estimateStatus),
    '<b>Клиент:</b> ' + L.esc(String(estimate.client_name || '—').slice(0,100)),
    '<b>Телефон:</b> ' + L.esc(String(estimate.client_phone || '—').slice(0,50)),
    '<b>Позиций:</b> ' + rows.length,
    '<b>ИТОГО:</b> ' + L.esc(money(total)),
    '<i>Подробная смета представлена таблицей выше. Полная версия — в Word-файле.</i>'
  ].join(nl);
}
function cellText(value, max = 240) {
  return String(value == null || value === '' ? '—' : value)
    .replace(/\s+/g, ' ').trim().slice(0, max) || '—';
}
function quoteRichMessage(estimate, leadStatus) {
  const rows = Array.isArray(estimate.items) ? estimate.items :
    (typeof estimate.items === 'string' ? JSON.parse(estimate.items || '[]') : []);
  const estimateStatus = ({draft:'Черновик',sent:'Отправлена',approved:'Согласована',rejected:'Отклонена'})[estimate.status] || estimate.status || 'Черновик';
  const subtotal = rows.reduce((sum, x) => sum + Number(x.qty || 0) * Number(x.price || 0), 0);
  const discount = Math.min(subtotal, Math.max(0, Number(estimate.discount || 0)));
  const total = Math.max(0, subtotal - discount);
  const header = [
    {text:'№',is_header:true,align:'center',valign:'middle'},
    {text:'Артикул',is_header:true,align:'left',valign:'middle'},
    {text:'Позиция / описание',is_header:true,align:'left',valign:'middle'},
    {text:'Ед.',is_header:true,align:'center',valign:'middle'},
    {text:'Кол-во',is_header:true,align:'right',valign:'middle'},
    {text:'Цена, BYN',is_header:true,align:'right',valign:'middle'},
    {text:'Сумма, BYN',is_header:true,align:'right',valign:'middle'}
  ];
  const maxRows = 100;
  const cells = [header].concat(rows.slice(0, maxRows).map((item, i) => {
    const qty = Number(item.qty || 0);
    const price = Number(item.price || 0);
    const description = String(item.name || 'Позиция') + (item.note ? ' — ' + String(item.note) : '');
    return [
      {text:String(i + 1),align:'center',valign:'middle'},
      {text:cellText(item.article,80),align:'left',valign:'middle'},
      {text:cellText(description,280),align:'left',valign:'middle'},
      {text:cellText(item.unit || 'шт.',40),align:'center',valign:'middle'},
      {text:qty.toLocaleString('ru-RU',{maximumFractionDigits:2}),align:'right',valign:'middle'},
      {text:money(price),align:'right',valign:'middle'},
      {text:money(qty * price),align:'right',valign:'middle'}
    ];
  }));
  const blocks = [
    {type:'heading',size:1,text:'ПАМЯТЬ.БАЙ · СМЕТА №' + cellText(estimate.id,30)},
    {type:'paragraph',text:[
      {type:'bold',text:'Статус заявки: '}, cellText(statusLabel(leadStatus),80),
      ' · ', {type:'bold',text:'Статус сметы: '}, cellText(estimateStatus,50)
    ]},
    {type:'paragraph',text:[
      {type:'bold',text:'Клиент: '}, cellText(estimate.client_name,100),
      ' · ', {type:'bold',text:'Телефон: '}, cellText(estimate.client_phone,50)
    ]},
    {type:'divider'},
    {type:'table',caption:'Позиции сметы',cells:cells,is_bordered:true,is_striped:true,is_compact:true},
    {type:'divider'},
    {type:'paragraph',text:[{type:'bold',text:'Сумма позиций: '},money(subtotal) + ' BYN']},
    {type:'paragraph',text:[{type:'bold',text:'Скидка: '},money(discount) + ' BYN']},
    {type:'paragraph',text:[{type:'bold',text:'ИТОГО: '},{type:'bold',text:money(total) + ' BYN'}]}
  ];
  if (estimate.notes) blocks.push({type:'paragraph',text:[{type:'bold',text:'Примечание: '},cellText(estimate.notes,600)]});
  if (rows.length > maxRows) blocks.push({type:'footer',text:'Показаны первые ' + maxRows + ' из ' + rows.length + ' позиций. Полная детализация доступна в Word-файле.'});
  return {blocks};
}
function quoteKeyboard(estimate) {
  const url = 'https://pamyat-bai-demo.vercel.app/estimate.html?token=' + encodeURIComponent(estimate.public_token);
  const sent = estimate.status === 'sent' || estimate.status === 'approved';
  const wordUrl = 'https://pamyat-bai-demo.vercel.app/api/estimate-file?token=' + encodeURIComponent(estimate.public_token);
  return { inline_keyboard: [
    [{ text:'🌐 Открыть смету', url:url }, { text:'📝 Word', url:wordUrl }],
    [{ text:sent ? '✅ Смета отправлена' : '📤 Отметить отправку', callback_data:'quote-status:sent:' + estimate.id }],
    [{ text:'👍 Согласована', callback_data:'quote-status:approved:' + estimate.id }, { text:'✖️ Отклонена', callback_data:'quote-status:rejected:' + estimate.id }]
  ] };
}
module.exports = { quoteText, quoteRichMessage, quoteKeyboard, statusLabel };
