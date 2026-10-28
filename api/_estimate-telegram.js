/* Shared Telegram table and status keyboard for estimate messages. */
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
  const nl = String.fromCharCode(10);
  const money = value => Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' BYN';
  const estimateStatus = ({draft:'Черновик',sent:'Отправлена',approved:'Согласована',rejected:'Отклонена'})[estimate.status] || estimate.status || 'Черновик';
  const lines = [
    '<b>ПАМЯТЬ.БАЙ · СМЕТА №' + estimate.id + '</b>',
    '<b>Статус заявки:</b> ' + L.esc(statusLabel(leadStatus)),
    '<b>Статус сметы:</b> ' + L.esc(estimateStatus),
    '',
    '<b>ПОЗИЦИИ</b>'
  ];
  let added = 0;
  for (let i=0; i<rows.length; i++) {
    const item = rows[i] || {};
    const article = String(item.article || 'Без артикула').slice(0,55);
    const name = String(item.name || 'Позиция').slice(0,140);
    const unit = String(item.unit || 'шт.').slice(0,20);
    const qty = Number(item.qty || 0).toLocaleString('ru-RU',{maximumFractionDigits:2});
    const price = money(item.price);
    const sum = money(Number(item.qty || 0) * Number(item.price || 0));
    const block = [
      '<b>' + (i+1) + '. ' + L.esc(article) + '</b>',
      L.esc(name),
      '<i>' + L.esc(qty + ' ' + unit + ' × ' + price + ' = ' + sum) + '</i>'
    ].join(nl);
    if (lines.join(nl).length + block.length + 2 > 3000) break;
    lines.push(block, '');
    added++;
  }
  if (added < rows.length) {
    lines.push('<i>Ещё позиций: ' + (rows.length-added) + '. Полная детализация доступна в скачиваемом Word-файле.</i>', '');
  }
  const subtotal = rows.reduce((sum,x)=>sum+Number(x.qty || 0)*Number(x.price || 0),0);
  const discount = Math.min(subtotal,Math.max(0,Number(estimate.discount || 0)));
  const total = Math.max(0,subtotal-discount);
  lines.push(
    '<b>Клиент:</b> ' + L.esc(estimate.client_name || '—'),
    '<b>Телефон:</b> ' + L.esc(estimate.client_phone || '—'),
    '<b>Сумма позиций:</b> ' + money(subtotal),
    '<b>Скидка:</b> ' + money(discount),
    '<b>ИТОГО:</b> ' + money(total)
  );
  if (estimate.notes) lines.push('<b>Примечание:</b> ' + L.esc(String(estimate.notes).slice(0,300)));
  return lines.join(nl).slice(0,3900);
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
