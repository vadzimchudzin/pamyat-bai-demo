/* ПАМЯТЬ.БАЙ — раздел каталога «Аксессуары»: весь каталог декора — вазы и вазоны, лампады и комплектующие, скульптура,
   декор, изделия из бронзы и натурального гранита, стенды.
   Позиции — api/_accessories.json (фото /assets/acc/<артикул>.webp — изделия, вырезанные со страниц каталога поставщика,
   на белом студийном фоне), группы и подгруппы — js/catalog-x.js (ACC_GROUPS).
   Каталог из админки хранится целиком, поэтому перенос однократный (addonsVersion): удалённый в админке раздел не возвращается.
   v2: группы-чипсы, группа позиции по артикулу; описание без серого и красного гранита.
   v3: весь каталог декора в группах с подгруппами; прежние позиции по умолчанию (V1…G1) и фото лампад «А-N» без названия
   и цены заменены позициями каталога (это те же лампады П001…П702 — с размерами и цветом); обложка — группа изделий каталога. */
'use strict';

const X = require('../js/catalog-x.js');
const DATA = require('./_accessories.json');

const VERSION = 3;
const OLD_DESC = 'Гранитные вазы, лампады, шары, столики и скамьи. Камень подбираем в тон памятнику: чёрный габбро-диабаз, серый или красный гранит.';
const DESC2 = 'Гранитные вазы, лампады, шары, столики и скамьи из чёрного габбро-диабаза — в тон памятнику.';
const DESC = 'Вазы, лампады, скульптура и декор для памятника: полимергранит, литьевой мрамор, бронза и натуральный гранит.';
const COVER = '/assets/catalog/cover-accessories.webp';
const CATEGORY = {
  id: 'accessories', name: 'Аксессуары', short: 'Аксессуар', price: 100,
  inc: '', visible: true, calc: false,
  desc: DESC,
  kit: [], cover: { img: COVER, zoom: 1 },
  groups: X.ACC_GROUPS.map(g => Object.assign({}, g))
};
/* цены — по запросу (price: null), их можно указать в админке */
const ITEMS = DATA.map(it => Object.assign({ cat: CATEGORY.id, price: null }, it));
// до v3: позиции по умолчанию (фото — /assets/catalog/<артикул>.webp) и группы-чипсы; «Столики и скамьи», «Подставки» — теперь «Прочее»
const OLD_CODES = new Set(['V1', 'V2', 'L1', 'L2', 'S1', 'T1', 'T2', 'G1']);
const OLD_GROUPS = new Set(['vases', 'lamps', 'tables', 'stands', 'bronze']);
const REGROUP = { tables: 'other', stands: 'other' };

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function blank(v) { return v == null || v === ''; }
// заменяем только то, что владелец не менял: заглушку со своим фото по умолчанию и лампаду «А-N» без названия и цены
function superseded(it) {
  if (!it || it.cat !== CATEGORY.id) return false;
  const code = String(it.code || '').trim();
  if (OLD_CODES.has(code)) return it.img === '/assets/catalog/' + code + '.webp';
  return /^[АA]-\d+$/.test(code) && /^\/api\/img\?/.test(it.img || '') && !String(it.name || '').trim() && blank(it.price);
}
function migrateCatalog(cat) {
  if (!cat || typeof cat !== 'object' || !Array.isArray(cat.categories)) return cat;
  const v = Number(cat.addonsVersion) || 0;
  if (v >= VERSION) return cat;
  const c = clone(cat);
  c.addonsVersion = VERSION;
  c.items = Array.isArray(c.items) ? c.items : [];
  let acc = c.categories.find(x => x && x.id === CATEGORY.id);
  if (v < 1 && !acc) {
    /* перед «Индивидуальным проектом», если он есть */
    const ind = c.categories.findIndex(x => x && x.id === 'individual');
    acc = clone(CATEGORY);
    c.categories.splice(ind > -1 ? ind : c.categories.length, 0, acc);
  }
  if (!acc) return c; // раздел удалён владельцем — не возвращается
  // группы: прежние по умолчанию — заменяем новыми; свои группы владельца сохраняем и дополняем недостающими
  const own = Array.isArray(acc.groups) ? acc.groups : null;
  const regroup = !own || own.every(g => g && OLD_GROUPS.has(g.id));
  if (regroup) acc.groups = clone(CATEGORY.groups);
  else {
    const have = new Set(own.map(g => g && g.id));
    CATEGORY.groups.forEach(g => { if (!have.has(g.id)) own.push(clone(g)); });
  }
  if (blank(acc.desc) || acc.desc === OLD_DESC || acc.desc === DESC2) acc.desc = DESC;
  else if (typeof acc.desc === 'string') acc.desc = acc.desc.replace(/,\s*серый или красный гранит/i, '');
  // обложка: прежняя по умолчанию или загруженное фото (одна лампада, мелкое) — группа изделий каталога
  const img = acc.cover && acc.cover.img || '';
  if (!img || img === '/assets/catalog/L1.webp' || /^\/api\/img\?/.test(img)) acc.cover = { img: COVER, zoom: 1 };
  c.items = c.items.filter(it => !superseded(it));
  c.items.forEach(it => {
    if (!it || it.cat !== CATEGORY.id) return;
    if (regroup && REGROUP[it.group]) it.group = REGROUP[it.group];
    if (it.group != null) return;
    const g = X.defaultGroup(it.code);
    if (g && acc.groups.some(x => x && x.id === g)) it.group = g;
  });
  const codes = new Set(c.items.map(x => x && x.code));
  ITEMS.forEach(it => { if (!codes.has(it.code)) c.items.push(clone(it)); });
  return c;
}

module.exports = { VERSION, CATEGORY, ITEMS, DESC, COVER, migrateCatalog };
