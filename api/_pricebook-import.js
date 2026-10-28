/* Import a price catalogue from CSV/TSV, Excel, DOCX or text-based PDF. */
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

function norm(value) {
  return String(value == null ? '' : value).replace(/\u00a0/g, ' ').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
function moneyNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let s = String(value == null ? '' : value).trim().replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!s || !/[0-9]/.test(s)) return null;
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (comma >= 0) {
    const decimals = s.length - comma - 1;
    s = decimals > 0 && decimals <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if ((s.match(/\./g) || []).length > 1) {
    const ix = s.lastIndexOf('.');
    s = s.slice(0, ix).replace(/\./g, '') + s.slice(ix);
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}
function findHeader(headers, regexes) {
  for (let i = 0; i < headers.length; i++) {
    if (regexes.some(re => re.test(norm(headers[i])))) return i;
  }
  return -1;
}
function normalizeRows(rows, sourceName) {
  const cleanRows = (rows || []).map(r => Array.isArray(r) ? r.map(v => String(v == null ? '' : v).trim()) : []);
  const nonEmpty = cleanRows.filter(r => r.some(v => v !== ''));
  if (!nonEmpty.length) throw new Error('В файле не найдено строк с данными.');
  const aliases = {
    category:[/катег/,/category/,/групп/,/раздел/],
    name:[/наимен/,/назван/,/товар/,/позици/,/product/,/item/,/материал/,/работа/,/услуг/,/description/],
    article:[/артик/,/sku/,/article/,/код\b/,/номенклат/],
    unit:[/^ед\.?$/, /ед\.?\s*изм/,/единиц/,/unit/,/measure/],
    price:[/цен/,/стоим/,/price/,/сумма\s*за\s*ед/],
    target:[/привяз/,/target/,/позици.*сайт/,/сайт/]
  };
  let headerRow = -1, indexes = null;
  for (let i = 0; i < Math.min(nonEmpty.length, 12); i++) {
    const h = nonEmpty[i];
    const ix = {};
    Object.keys(aliases).forEach(k => ix[k] = findHeader(h, aliases[k]));
    if (ix.name >= 0 && ix.price >= 0) { headerRow = i; indexes = ix; break; }
  }
  let data;
  if (headerRow >= 0) {
    data = nonEmpty.slice(headerRow + 1);
  } else {
    indexes = {category:0,name:1,article:-1,unit:2,price:3,target:4};
    data = nonEmpty;
  }
  const sourceExt = (String(sourceName || '').match(/\.([^.]+)$/) || [,''])[1].toLowerCase();
  const legacyDelimited = ['csv','tsv','txt'].includes(sourceExt);
  const items = [];
  data.forEach((r, i) => {
    let category = '', name = '', article = '', unit = 'шт.', price = null, siteTarget = '';
    if (headerRow >= 0) {
      category = indexes.category >= 0 ? r[indexes.category] || '' : '';
      name = indexes.name >= 0 ? r[indexes.name] || '' : '';
      article = indexes.article >= 0 ? r[indexes.article] || '' : '';
      unit = indexes.unit >= 0 ? r[indexes.unit] || 'шт.' : 'шт.';
      price = indexes.price >= 0 ? moneyNumber(r[indexes.price]) : null;
      siteTarget = indexes.target >= 0 ? r[indexes.target] || '' : '';
    } else if (legacyDelimited) {
      // CSV/TSV without a header keeps the legacy column order:
      // category, name, unit, price, target, article.
      category = r[0] || '';
      name = r[1] || '';
      unit = r[2] || 'шт.';
      price = moneyNumber(r[3]);
      siteTarget = r[4] || '';
      article = r[5] || '';
    } else {
      // For tables without headers, accept category/name/article/unit/price/target
      // and the compact article/name/unit/price layout commonly used in documents.
      let priceIdx = -1;
      for (let j=r.length-1; j>=0; j--) {
        if (moneyNumber(r[j]) !== null && String(r[j]).trim() !== '') { priceIdx=j; break; }
      }
      if (priceIdx >= 0) price = moneyNumber(r[priceIdx]);
      if (r.length >= 5) {
        category = r[0] || '';
        name = r[1] || '';
        article = r[2] || '';
        unit = r[3] || 'шт.';
        siteTarget = r[priceIdx + 1] || '';
      } else if (r.length === 4) {
        article = r[0] || '';
        name = r[1] || '';
        unit = r[2] || 'шт.';
      } else {
        const prefix = (priceIdx >= 0 ? r.slice(0,priceIdx) : r).filter(Boolean);
        const first = prefix[0] || '';
        if (/^[A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9._/-]{1,30}$/.test(first) && prefix.length >= 2) {
          article = first;
          name = prefix.slice(1).join(' ');
        } else {
          name = prefix.join(' ');
        }
        unit = 'шт.';
      }
    }
    name = String(name || '').trim();
    if (!name || /^(итого|всего|сумма|примечание|категория|наименование)$/i.test(name)) return;
    items.push({
      id:'import-' + (i + 1),
      category:String(category || '').trim(),
      name:name.slice(0,220),
      article:String(article || '').trim().slice(0,80),
      unit:String(unit || 'шт.').trim().slice(0,40),
      price:price === null ? null : Math.max(0, price),
      siteTarget:String(siteTarget || '').trim().slice(0,220)
    });
  });
  if (!items.length) {
    throw new Error('Не удалось распознать строки каталога. В файле должны быть колонки «Наименование» и «Цена». PDF должен содержать выделяемый текст, а не скан-картинку.');
  }
  return {items, source:sourceName, count:items.length, warnings:items.filter(x => x.price === null).length};
}
function textRows(text) {
  const lines = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return lines.map(line => {
    if (line.includes('\t')) return line.split('\t').map(x => x.trim());
    if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map(x => x.trim());
    if (line.includes('|')) return line.split('|').map(x => x.trim()).filter(Boolean);
    // For flattened PDF rows, split a trailing price from article/name.
    const m = line.match(/^(.*?)[\s]+((?:BYN|руб\.?|р\.)?\s*\d[\d\s.,]*\d|\d)(?:\s*(?:BYN|руб\.?|р\.))?$/i);
    if (m) {
      const left = m[1].trim();
      const tokens = left.split(/\s+/);
      if (tokens.length >= 2 && /^[A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9._/-]{1,30}$/.test(tokens[0])) {
        return [tokens[0], tokens.slice(1).join(' '), 'шт.', m[2]];
      }
      return [left, m[2]];
    }
    return [line];
  });
}
async function parsePricebookFile({fileName, base64, mimeType}) {
  const filename = String(fileName || 'catalog').slice(0,200);
  const ext = (filename.match(/\.([^.]+)$/) || [,''])[1].toLowerCase();
  if (!['csv','tsv','txt','xlsx','xls','docx','pdf'].includes(ext)) {
    throw new Error('Поддерживаются CSV, TSV, TXT, XLSX, XLS, DOCX и PDF. Старый DOC сначала сохраните как DOCX.');
  }
  const encoded = String(base64 || '').replace(/^data:[^,]*;base64,/i,'').replace(/\s/g,'');
  if (!encoded) throw new Error('Файл пустой.');
  if (encoded.length > 4.2 * 1024 * 1024) throw new Error('Файл слишком большой. Максимальный размер — 3 МБ.');
  const buffer = Buffer.from(encoded,'base64');
  if (!buffer.length) throw new Error('Не удалось прочитать содержимое файла.');
  let rows;
  if (['xlsx','xls','csv','tsv','txt'].includes(ext)) {
    const workbook = XLSX.read(buffer,{type:'buffer',raw:false,cellDates:false});
    const first = workbook.SheetNames[0];
    if (!first) throw new Error('В файле нет листа с данными.');
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[first],{header:1,defval:'',raw:false});
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({buffer});
    rows = textRows(result.value);
  } else if (ext === 'pdf') {
    const result = await pdfParse(buffer);
    if (!String(result.text || '').trim()) throw new Error('PDF выглядит как скан без текстового слоя. Сохраните его с распознанным текстом (OCR) или экспортируйте таблицу в Excel.');
    rows = textRows(result.text);
  }
  return normalizeRows(rows,filename);
}
module.exports = { parsePricebookFile };
