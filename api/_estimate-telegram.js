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
    '<i>Подробная смета представлена таблицей на изображении. Полная версия — в Word-файле.</i>'
  ].join(nl);
}
function quoteKeyboard(estimate) {
  const url = 'https://pamyat-bai-demo.vercel.app/estimate.html?token=' + encodeURIComponent(estimate.public_token);
  const sent = estimate.status === 'sent' || estimate.status === 'approved';
  const wordUrl = 'https://pamyat-bai-demo.vercel.app/api/estimate-file?token=' + encodeURIComponent(estimate.public_token);
  return { inline_keyboard: [
    [{ text:'Открыть смету / PDF', url:url }],
    [{ text:'Скачать смету Word (.docx)', url:wordUrl }],
    [{ text:sent ? 'Смета уже отправлена' : 'Отметить: смета отправлена', callback_data:'quote-status:sent:' + estimate.id }]
  ] };
}
module.exports = { quoteText, quoteKeyboard, statusLabel };
