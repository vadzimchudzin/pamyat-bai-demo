/* Generate a .docx attachment for each new lead. */
const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, Packer
} = require('docx');

function clean(value) {
  return String(value == null || value === '' ? '—' : value).replace(/[\u0000-\u001f]+/g, ' ').trim();
}
function p(text, options) {
  return new Paragraph({ children: [new TextRun(Object.assign({ text: clean(text), font: 'Arial', size: 20 }, options || {}))], spacing: { after: 70 } });
}
function cell(text, header) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: header ? { fill: 'EDE2D2', type: ShadingType.CLEAR } : undefined,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text: clean(text), font: 'Arial', size: 20, bold: !!header, color: header ? '5B472D' : '29231C' })],
      spacing: { after: 0 }
    })]
  });
}
function table(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, i) => new TableRow({ children: [cell(row[0], i === 0), cell(row[1], i === 0)] })),
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
async function makeLeadDocx(lead) {
  const time = new Date(lead.created_at || Date.now()).toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' });
  const summary = lead.config && lead.config.summary ? String(lead.config.summary) : '';
  const rows = [
    ['Поле', 'Значение'],
    ['Номер заявки', '№' + lead.id],
    ['Дата и время', time],
    ['Клиент', clean(lead.name)],
    ['Телефон', clean(lead.phone)],
    ['Тип', lead.type === 'calc' ? 'Расчёт с сайта' : 'Звонок / консультация'],
    ['Предварительная сумма', lead.price == null ? 'Индивидуальный расчёт' : Number(lead.price).toLocaleString('ru-RU') + ' BYN'],
    ['Статус', clean(lead.status || 'новая')],
    ['Состав расчёта', summary || 'Не указан'],
    ['Комментарий клиента', clean(lead.comment)],
    ['Источник', clean(lead.source)],
    ['Ответственный', clean(lead.taken_by)]
  ];
  const doc = new Document({
    creator: 'ПАМЯТЬ.БАЙ',
    title: 'Заявка №' + lead.id + ' — ПАМЯТЬ.БАЙ',
    subject: 'Карточка заявки клиента',
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: 'ПАМЯТЬ.БАЙ', bold: true, font: 'Arial', size: 34, color: '9A7436' })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 280 },
          children: [new TextRun({ text: 'ЗАЯВКА №' + lead.id, bold: true, font: 'Arial', size: 28, color: '29231C' })]
        }),
        p('Карточка обращения клиента. Вся информация ниже сформирована автоматически из заявки.'),
        table(rows),
        new Paragraph({ spacing: { before: 280 }, children: [new TextRun({ text: 'ПАМЯТЬ.БАЙ · Предварительная информация для внутренней обработки заявки', font: 'Arial', size: 16, color: '756B60', italics: true })] })
      ]
    }]
  });
  return Packer.toBuffer(doc);
}
module.exports = { makeLeadDocx };
