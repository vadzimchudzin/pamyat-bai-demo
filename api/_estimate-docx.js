/* Branded Word estimate with an actual tabular breakdown. */
const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, Packer
} = require('docx');

function clean(value) {
  return String(value == null || value === '' ? '—' : value).replace(/[\u0000-\u001f]+/g, ' ').trim();
}
function money(value) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' BYN';
}
function paragraph(text, opts) {
  return new Paragraph({
    alignment: opts && opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: opts && opts.before || 0, after: !opts || opts.after == null ? 100 : opts.after },
    children: [new TextRun({
      text: clean(text),
      font: 'Arial',
      size: opts && opts.size || 20,
      bold: !!(opts && opts.bold),
      italics: !!(opts && opts.italics),
      color: opts && opts.color || '29231C'
    })]
  });
}
function makeCell(text, header, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: header ? { fill: 'EDE2D2', type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 90, right: 90 },
    children: [new Paragraph({
      children: [new TextRun({
        text: clean(text),
        font: 'Arial',
        size: 18,
        bold: !!header,
        color: header ? '5B472D' : '29231C'
      })],
      spacing: { after: 0 }
    })]
  });
}
function makeTable(headers, rows, widths) {
  const all = [headers].concat(rows);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: all.map((row, i) => new TableRow({
      tableHeader: i === 0,
      children: row.map((value, j) => makeCell(value, i === 0, widths[j]))
    })),
    borders: {
      top: { style: BorderStyle.SINGLE, size: 3, color: 'D8C7AD' },
      bottom: { style: BorderStyle.SINGLE, size: 3, color: 'D8C7AD' },
      left: { style: BorderStyle.SINGLE, size: 3, color: 'D8C7AD' },
      right: { style: BorderStyle.SINGLE, size: 3, color: 'D8C7AD' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E7DED0' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'E7DED0' }
    }
  });
}
async function makeEstimateDocx(estimate, company) {
  const rows = Array.isArray(estimate.items) ? estimate.items :
    (typeof estimate.items === 'string' ? JSON.parse(estimate.items || '[]') : []);
  const lineRows = rows.map((item, i) => [
    String(i + 1),
    clean(item.article || '—'),
    clean(item.name) + (item.note ? ' · ' + clean(item.note) : ''),
    clean(item.unit || 'шт.'),
    Number(item.qty || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }),
    money(item.price),
    money(Number(item.qty || 0) * Number(item.price || 0))
  ]);
  const subtotal = rows.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const discount = Math.min(subtotal, Math.max(0, Number(estimate.discount || 0)));
  const total = Math.max(0, subtotal - discount);
  const c = company || {};
  const created = estimate.created_at ? new Date(estimate.created_at).toLocaleDateString('ru-RU') : new Date().toLocaleDateString('ru-RU');
  const meta = [
    ['Клиент', clean(estimate.client_name)],
    ['Телефон', clean(estimate.client_phone)],
    ['Дата', created],
    ['Заявка', estimate.lead_id ? '№' + estimate.lead_id : '—'],
    ['Организация', clean(c.company)],
    ['УНП', clean(c.unp)]
  ];
  const doc = new Document({
    creator: 'ПАМЯТЬ.БАЙ',
    title: 'Смета №' + estimate.id + ' — ПАМЯТЬ.БАЙ',
    subject: 'Расчёт стоимости работ и материалов',
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 900, right: 850, bottom: 900, left: 850 } } },
      children: [
        paragraph('ПАМЯТЬ.БАЙ', { center:true, size:34, bold:true, color:'9A7436', after:80 }),
        paragraph('СМЕТА №' + estimate.id, { center:true, size:28, bold:true, after:80 }),
        paragraph('Расчёт стоимости работ и материалов', { center:true, size:21, color:'756B60', after:220 }),
        makeTable(['Реквизит','Значение'], meta, [30,70]),
        paragraph(''),
        makeTable(['№','Артикул','Позиция / описание','Ед.','Кол-во','Цена','Сумма'], lineRows, [5,13,32,8,10,16,16]),
        paragraph(''),
        paragraph('Сумма позиций: ' + money(subtotal), { size:21 }),
        paragraph('Скидка: ' + money(discount), { size:21 }),
        paragraph('ИТОГО: ' + money(total), { size:28, bold:true, color:'9A7436', before:80, after:180 }),
        ...(estimate.notes ? [paragraph('Примечание: ' + estimate.notes, { size:19, after:180 })] : []),
        paragraph('Смета носит предварительный характер. Итоговая стоимость подтверждается после согласования материалов, размеров и условий выполнения работ.', { size:16, italics:true, color:'756B60', after:0 })
      ]
    }]
  });
  return Packer.toBuffer(doc);
}
module.exports = { makeEstimateDocx };
