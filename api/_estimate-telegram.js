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
  function fit(value, width) {
    const text = String(value == null ? '—' : value).replace(/[\\r\\n]+/g, ' ').trim();
    const chars = Array.from(text);
    const short = chars.length > width ? chars.slice(0,width-1).join('') + '…' : text;
    return short + ' '.repeat(Math.max(0,width-Array.from(short).length));
  }
  const widths = [2, 10, 20, 4, 4, 9, 9];
  const headers = ['№','Артикул','Позиция','Ед.','Кол.','Цена','Сумма'];
  const tableRows = rows.slice(0, 30).map((x,i)=>[
    String(i+1), x.article || '—', x.name || 'Позиция', x.unit || 'шт.',
    Number(x.qty || 0).toLocaleString('ru-RU',{maximumFractionDigits:2}),
    money(x.price), money(Number(x.qty || 0)*Number(x.price || 0))
  ]);
  function line(row) { return '│ ' + row.map((x,i)=>fit(x,widths[i])).join(' │ ') + ' │'; }
  const top = '┌' + widths.map(w=>'─'.repeat(w+2)).join('┬') + '┐';
  const mid = '├' + widths.map(w=>'─'.repeat(w+2)).join('┼') + '┤';
  const bottom = '└' + widths.map(w=>'─'.repeat(w+2)).join('┴') + '┘';
  const nl = String.fromCharCode(10);
  const printedRows = [top,line(headers),mid].concat(tableRows.map(line));
  if (rows.length > tableRows.length) printedRows.push('… остальные позиции полностью указаны в Word-файле');
  printedRows.push(bottom);
  const subtotal = rows.reduce((sum,x)=>sum+Number(x.qty || 0)*Number(x.price || 0),0);
  const discount = Math.min(subtotal,Math.max(0,Number(estimate.discount || 0)));
  const total = Math.max(0,subtotal-discount);
  const estimateStatus = ({draft:'Черновик',sent:'Отправлена',approved:'Согласована',rejected:'Отклонена'})[estimate.status] || estimate.status || 'Черновик';
  const lines = [
    '<b>ПАМЯТЬ.БАЙ · СМЕТА №' + estimate.id + '</b>',
    '<b>📍 Статус заявки: ' + L.esc(statusLabel(leadStatus)) + '</b>',
    '<b>Статус сметы: ' + L.esc(estimateStatus) + '</b>',
    '<pre>' + L.esc(printedRows.join(nl)) + '</pre>',
    '<b>Клиент:</b> ' + L.esc(estimate.client_name || '—'),
    '<b>Телефон:</b> ' + L.esc(estimate.client_phone || '—'),
    '<b>Сумма позиций:</b> ' + money(subtotal),
    '<b>Скидка:</b> ' + money(discount),
    '<b>ИТОГО:</b> ' + money(total)
  ];
  if (estimate.notes) lines.push('<b>Примечание:</b> ' + L.esc(String(estimate.notes).slice(0,400)));
  return lines.join(nl);
}
function quoteKeyboard(estimate) {
  const url = 'https://pamyat-bai-demo.vercel.app/estimate.html?token=' + encodeURIComponent(estimate.public_token);
  const sent = estimate.status === 'sent' || estimate.status === 'approved';
  return { inline_keyboard: [
    [{ text:'📄 Открыть смету / PDF', url:url }],
    [{ text:sent ? '✅ Смета отправлена клиенту' : '📤 Отметить «Смета отправлена»', callback_data:'quote-status:sent:' + estimate.id }]
  ] };
}
module.exports = { quoteText, quoteKeyboard, statusLabel };
