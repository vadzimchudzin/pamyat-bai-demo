/* ПАМЯТЬ.БАЙ — раздел каталога «Аксессуары» (вазы, лампады, шары, столики, скамьи).
   Фото — студийные рендеры (tools/media/accessories.py → workflow catalog-media.yml).
   Каталог из админки хранится целиком, поэтому раздел добавляется однократно (addonsVersion):
   если потом удалить или переименовать его в админке, он не вернётся.
   Версия 2: группы-чипсы (вазы, лампады, столики и скамьи, подставки, изделия из бронзы — js/catalog-x.js),
   у позиций — группа по артикулу; описание без серого и красного гранита (аксессуары — из чёрного габбро-диабаза). */
'use strict';

const X = require('../js/catalog-x.js');

const VERSION = 2;
const OLD_DESC = 'Гранитные вазы, лампады, шары, столики и скамьи. Камень подбираем в тон памятнику: чёрный габбро-диабаз, серый или красный гранит.';
const DESC = 'Гранитные вазы, лампады, шары, столики и скамьи из чёрного габбро-диабаза — в тон памятнику.';
const CATEGORY = {
  id: 'accessories', name: 'Аксессуары', short: 'Аксессуар', price: 100,
  inc: '', visible: true, calc: false,
  desc: DESC,
  kit: [], cover: { img: '/assets/catalog/L1.webp', zoom: 1 },
  groups: X.ACC_GROUPS.map(g => Object.assign({}, g))
};
/* price — «от», BYN (ваза и лампада — как в калькуляторе; остальное — по запросу, цену можно указать в админке) */
const ITEMS = [
  { code: 'V1', name: 'Ваза «Кубок»', size: 'Ø 18 × 32 см', price: 100 },
  { code: 'V2', name: 'Ваза «Тюльпан»', size: 'Ø 16 × 42 см', price: null },
  { code: 'L1', name: 'Лампада гранитная', size: '16 × 16 × 36 см', price: 200 },
  { code: 'L2', name: 'Лампада «Часовня»', size: '20 × 20 × 44 см', price: null },
  { code: 'S1', name: 'Шар на подставке', size: 'Ø 15 см', price: null },
  { code: 'T1', name: 'Столик круглый', size: 'Ø 50 × 70 см', price: null },
  { code: 'T2', name: 'Скамья', size: '100 × 35 × 45 см', price: null },
  { code: 'G1', name: 'Подставка под цветы', size: '40 × 20 × 15 см', price: null }
].map(it => Object.assign({ cat: CATEGORY.id, img: '/assets/catalog/' + it.code + '.webp', group: X.defaultGroup(it.code) }, it));

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function migrateCatalog(cat) {
  if (!cat || typeof cat !== 'object' || !Array.isArray(cat.categories)) return cat;
  const v = Number(cat.addonsVersion) || 0;
  if (v >= VERSION) return cat;
  const c = clone(cat);
  c.addonsVersion = VERSION;
  c.items = Array.isArray(c.items) ? c.items : [];
  if (v < 1) {
    if (!c.categories.some(x => x && x.id === CATEGORY.id)) {
      /* перед «Индивидуальным проектом», если он есть */
      const ind = c.categories.findIndex(x => x && x.id === 'individual');
      c.categories.splice(ind > -1 ? ind : c.categories.length, 0, clone(CATEGORY));
    }
    const codes = new Set(c.items.map(x => x && x.code));
    ITEMS.forEach(it => { if (!codes.has(it.code)) c.items.push(clone(it)); });
  }
  /* v2: группы и описание раздела — только если раздел ещё есть (удалённый владельцем не возвращается) */
  const acc = c.categories.find(x => x && x.id === CATEGORY.id);
  if (acc) {
    if (!Array.isArray(acc.groups)) acc.groups = clone(CATEGORY.groups);
    if (acc.desc === OLD_DESC) acc.desc = DESC;
    else if (typeof acc.desc === 'string') acc.desc = acc.desc.replace(/,\s*серый или красный гранит/i, '');
    c.items.forEach(it => {
      if (!it || it.cat !== CATEGORY.id || it.group != null) return;
      const g = X.defaultGroup(it.code);
      if (g && acc.groups.some(x => x && x.id === g)) it.group = g;
    });
  }
  return c;
}

module.exports = { VERSION, CATEGORY, ITEMS, migrateCatalog };
