/* Render estimate items as a true visual grid image for Telegram. */
const { Resvg } = require('@resvg/resvg-js');

function clean(value) {
  const s = String(value == null || value === '' ? '—' : value);
  return s.replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;').trim();
}
function money(value) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
function wrapped(value, maxChars, maxLines) {
  const source = String(value == null || value === '' ? '—' : value).replace(/\r/g, '').split('\n');
  const lines = [];
  for (const part of source) {
    const words = part.split(/\s+/).filter(Boolean);
    let line = '';
    for (let word of words) {
      while (word.length > maxChars) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!word) continue;
      const next = line ? line + ' ' + word : word;
      if (next.length > maxChars && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line || !words.length) lines.push(line || '—');
  }
  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = clipped[maxLines - 1].replace(/\s+$/, '') + '…';
    return clipped;
  }
  return lines;
}
function makeEstimateTablePng(estimate, leadStatus) {
  const items = Array.isArray(estimate.items) ? estimate.items :
    (typeof estimate.items === 'string' ? JSON.parse(estimate.items || '[]') : []);
  const maxRows = 55;
  const visible = items.slice(0, maxRows);
  const cols = [
    { title:'№', width:54, chars:4, align:'middle' },
    { title:'Артикул', width:150, chars:13, align:'start' },
    { title:'Позиция / описание', width:600, chars:54, align:'start' },
    { title:'Ед.', width:75, chars:6, align:'middle' },
    { title:'Кол-во', width:130, chars:11, align:'end' },
    { title:'Цена, BYN', width:200, chars:17, align:'end' },
    { title:'Сумма, BYN', width:200, chars:17, align:'end' }
  ];
  const margin = 36, tableX = margin, tableY = 218, headerH = 60;
  const tableW = cols.reduce((n, c) => n + c.width, 0);
  const width = tableW + margin * 2;
  const lineH = 27;
  const rowData = visible.map((item, i) => {
    const desc = String(item.name || 'Позиция') + (item.note ? '\n' + String(item.note) : '');
    const cellValues = [
      String(i + 1),
      String(item.article || '—'),
      desc,
      String(item.unit || 'шт.'),
      Number(item.qty || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }),
      money(item.price),
      money(Number(item.qty || 0) * Number(item.price || 0))
    ];
    const cellLines = cellValues.map((v, j) => wrapped(v, cols[j].chars, j === 2 ? 4 : 2));
    const maxLines = Math.max(1, ...cellLines.map(a => a.length));
    return { cellLines, height: Math.max(58, maxLines * lineH + 18) };
  });
  const rowsHeight = rowData.reduce((n, r) => n + r.height, 0);
  const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const discount = Math.min(subtotal, Math.max(0, Number(estimate.discount || 0)));
  const total = Math.max(0, subtotal - discount);
  const note = String(estimate.notes || '').replace(/[\u0000-\u001f]+/g, ' ').trim();
  const footerH = 230 + (note ? 54 : 0) + (items.length > visible.length ? 48 : 0);
  const height = tableY + headerH + rowsHeight + footerH;
  const pieces = [];
  const add = s => pieces.push(s);
  const txt = (x,y,text,size,fill,weight='400',anchor='start') =>
    add('<text x="' + x + '" y="' + y + '" font-family="Arial, sans-serif" font-size="' + size + '" font-weight="' + weight + '" fill="' + fill + '" text-anchor="' + anchor + '">' + clean(text) + '</text>');
  const estimateStatus = ({draft:'Черновик',sent:'Отправлена',approved:'Согласована',rejected:'Отклонена'})[estimate.status] || estimate.status || 'Черновик';
  add('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">');
  add('<rect width="100%" height="100%" fill="#f7f3ec"/>');
  add('<rect x="0" y="0" width="' + width + '" height="10" fill="#9a7436"/>');
  txt(margin, 58, 'ПАМЯТЬ.БАЙ · СМЕТА №' + estimate.id, 34, '#36291d', '700');
  txt(margin, 94, 'Заявка: ' + (leadStatus || '—') + '  ·  Статус сметы: ' + estimateStatus, 20, '#6b5a47', '600');
  txt(margin, 132, 'Клиент: ' + (estimate.client_name || '—'), 21, '#29231c', '600');
  txt(margin, 164, 'Телефон: ' + (estimate.client_phone || '—'), 21, '#29231c', '400');
  txt(width - margin, 164, 'Всего позиций: ' + items.length, 20, '#6b5a47', '600', 'end');

  add('<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + headerH + '" fill="#51402e" rx="4"/>');
  let x = tableX;
  cols.forEach(col => {
    const anchor = col.align === 'end' ? 'end' : (col.align === 'middle' ? 'middle' : 'start');
    const tx = anchor === 'end' ? x + col.width - 12 : (anchor === 'middle' ? x + col.width / 2 : x + 12);
    txt(tx, tableY + 37, col.title, 18, '#ffffff', '700', anchor);
    x += col.width;
  });
  let y = tableY + headerH;
  rowData.forEach((row, ri) => {
    add('<rect x="' + tableX + '" y="' + y + '" width="' + tableW + '" height="' + row.height + '" fill="' + (ri % 2 ? '#ffffff' : '#f0e8dc') + '"/>');
    let cx = tableX;
    row.cellLines.forEach((lines, ci) => {
      const col = cols[ci];
      const anchor = col.align === 'end' ? 'end' : (col.align === 'middle' ? 'middle' : 'start');
      const tx = anchor === 'end' ? cx + col.width - 12 : (anchor === 'middle' ? cx + col.width / 2 : cx + 12);
      const blockH = lines.length * lineH;
      const baseline = y + Math.max(20, (row.height - blockH) / 2 + 21);
      lines.forEach((line, li) => txt(tx, baseline + li * lineH, line, 19, '#29231c', '400', anchor));
      cx += col.width;
    });
    add('<line x1="' + tableX + '" y1="' + (y + row.height) + '" x2="' + (tableX + tableW) + '" y2="' + (y + row.height) + '" stroke="#d6c9b7" stroke-width="1.5"/>');
    y += row.height;
  });
  let vx = tableX;
  add('<rect x="' + tableX + '" y="' + tableY + '" width="' + tableW + '" height="' + (headerH + rowsHeight) + '" fill="none" stroke="#cbbca7" stroke-width="2"/>');
  cols.slice(0, -1).forEach(col => {
    vx += col.width;
    add('<line x1="' + vx + '" y1="' + tableY + '" x2="' + vx + '" y2="' + y + '" stroke="#d6c9b7" stroke-width="1.2"/>');
  });
  y += 28;
  txt(tableX + tableW - 6, y, 'Сумма позиций: ' + money(subtotal) + ' BYN', 21, '#4e4133', '400', 'end');
  y += 34;
  txt(tableX + tableW - 6, y, 'Скидка: ' + money(discount) + ' BYN', 21, '#4e4133', '400', 'end');
  y += 42;
  txt(tableX + tableW - 6, y, 'ИТОГО: ' + money(total) + ' BYN', 30, '#9a7436', '700', 'end');
  y += 36;
  if (note) {
    txt(tableX, y, 'Примечание: ' + wrapped(note, 150, 1)[0], 17, '#756b60', '400');
    y += 26;
  }
  if (items.length > visible.length) {
    txt(tableX, y, 'На изображении первые ' + visible.length + ' позиций из ' + items.length + '. Полная детализация — в Word-файле.', 17, '#756b60', '400');
  }
  add('</svg>');
  const renderer = new Resvg(pieces.join(''), { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' } });
  return renderer.render().asPng();
}
module.exports = { makeEstimateTablePng };
