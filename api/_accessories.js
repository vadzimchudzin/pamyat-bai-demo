/* ПАМЯТЬ.БАЙ — раздел каталога «Аксессуары» (вазы, лампады, шары, столики, скамьи).
   Фото — студийные рендеры (tools/media/accessories.py → workflow catalog-media.yml).
   Каталог из админки хранится целиком, поэтому раздел добавляется однократно (addonsVersion):
   если потом удалить или переименовать его в админке, он не вернётся. */
'use strict';

const VERSION = 1;
const CATEGORY = {
  id: 'accessories', name: 'Аксессуары', short: 'Аксессуар', price: 100,
  inc: '', visible: true, calc: false,
  desc: 'Гранитные вазы, лампады, шары, столики и скамьи. Камень подбираем в тон памятнику: чёрный габбро-диабаз, серый или красный гранит.',
  kit: [], cover: { img: '/assets/catalog/L1.webp', zoom: 1 }
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
].map(it => Object.assign({ cat: CATEGORY.id, img: '/assets/catalog/' + it.code + '.webp' }, it));

function migrateCatalog(cat) {
  if (!cat || typeof cat !== 'object' || !Array.isArray(cat.categories)) return cat;
  if (Number(cat.addonsVersion) >= VERSION) return cat;
  const c = JSON.parse(JSON.stringify(cat));
  c.addonsVersion = VERSION;
  c.items = Array.isArray(c.items) ? c.items : [];
  if (!c.categories.some(x => x && x.id === CATEGORY.id)) {
    /* перед «Индивидуальным проектом», если он есть */
    const ind = c.categories.findIndex(x => x && x.id === 'individual');
    c.categories.splice(ind > -1 ? ind : c.categories.length, 0, JSON.parse(JSON.stringify(CATEGORY)));
  }
  const codes = new Set(c.items.map(x => x && x.code));
  ITEMS.forEach(it => { if (!codes.has(it.code)) c.items.push(JSON.parse(JSON.stringify(it))); });
  return c;
}

module.exports = { VERSION, CATEGORY, ITEMS, migrateCatalog };
