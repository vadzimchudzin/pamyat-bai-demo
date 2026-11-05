'use strict';
/* Раздел «Аксессуары»: однократное добавление в сохранённый каталог (addonsVersion). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../api/_accessories.js');
const STORED = require('../api/_catalog.json');

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function siteDefault() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/catalog-default.js'), 'utf8'), ctx);
  return clone(ctx.window.PAMYAT_CATALOG_DEFAULT); // массивы из другого контекста VM
}

test('добавляет раздел перед «Индивидуальным проектом» и все позиции', () => {
  const src = clone(STORED); delete src.addonsVersion;
  src.categories = src.categories.filter(c => c.id !== A.CATEGORY.id);
  src.items = src.items.filter(i => i.cat !== A.CATEGORY.id);
  const out = A.migrateCatalog(src);
  assert.equal(out.addonsVersion, A.VERSION);
  const ids = out.categories.map(c => c.id), at = ids.indexOf('accessories');
  assert.ok(at > -1, 'раздел добавлен');
  const ind = ids.indexOf('individual');
  if (ind > -1) assert.equal(at, ind - 1, 'стоит перед «Индивидуальным»');
  assert.equal(out.categories[at].calc, false, 'не участвует в шаге «Памятник»');
  const codes = out.items.filter(i => i.cat === 'accessories').map(i => i.code);
  assert.deepEqual(codes, A.ITEMS.map(i => i.code));
  assert.equal(out.items.length, src.items.length + A.ITEMS.length);
  assert.equal(src.addonsVersion, undefined, 'исходный объект не меняется');
});

test('идемпотентно и уважает правки владельца', () => {
  const src = clone(STORED); delete src.addonsVersion;
  const once = A.migrateCatalog(src), twice = A.migrateCatalog(once);
  assert.equal(twice, once, 'повторный вызов ничего не меняет');
  // владелец удалил раздел и сохранил каталог — он не возвращается
  const removed = clone(once);
  removed.categories = removed.categories.filter(c => c.id !== 'accessories');
  removed.items = removed.items.filter(i => i.cat !== 'accessories');
  assert.deepEqual(A.migrateCatalog(removed), removed);
});

test('не дублирует позиции, если артикулы уже есть', () => {
  const src = clone(STORED); delete src.addonsVersion;
  src.items.push({ code: 'В001', cat: 'vertical', img: '/assets/catalog/V1.webp' });
  const out = A.migrateCatalog(src);
  assert.equal(out.items.filter(i => i.code === 'В001').length, 1);
});

test('пустые и чужие данные не ломают перенос', () => {
  assert.equal(A.migrateCatalog(null), null);
  assert.deepEqual(A.migrateCatalog({ foo: 1 }), { foo: 1 });
  const out = A.migrateCatalog({ categories: [] });
  assert.deepEqual(out.categories.map(c => c.id), ['accessories']);
  assert.equal(out.items.length, A.ITEMS.length);
});

test('каталог сайта по умолчанию совпадает с серверным разделом', () => {
  const d = siteDefault();
  assert.equal(d.addonsVersion, A.VERSION);
  const cat = d.categories.find(c => c.id === 'accessories');
  assert.ok(cat && cat.calc === false);
  const items = d.items.filter(i => i.cat === 'accessories');
  assert.deepEqual(items.map(i => [i.code, i.name, i.size, i.price, i.img]), A.ITEMS.map(i => [i.code, i.name, i.size, i.price, i.img]));
});

test('данные раздела: артикулы уникальны, группы — подгруппы ACC_GROUPS, фото /assets/acc/', () => {
  const X = require('../js/catalog-x.js');
  const ids = new Set(X.ACC_GROUPS.map(g => g.id));
  const codes = new Set();
  A.ITEMS.forEach(it => {
    assert.ok(it.code && !codes.has(it.code), 'артикул ' + it.code); codes.add(it.code);
    assert.ok(ids.has(it.group), it.code + ': группа ' + it.group);
    assert.match(it.img, /^\/assets\/acc\/[a-z0-9-]+\.webp$/);
    assert.equal(it.price, null);
    assert.ok(it.name, it.code);
    assert.ok(fs.existsSync(path.join(__dirname, '..', it.img)), 'нет фото ' + it.img);
  });
  // каждая группа и подгруппа каталога не пустая
  const used = new Set(A.ITEMS.map(i => i.group));
  X.ACC_GROUPS.filter(g => g.parent || !X.ACC_GROUPS.some(k => k.parent === g.id)).forEach(g => assert.ok(used.has(g.id), 'пустая группа ' + g.id));
  assert.ok(A.ITEMS.length > 300);
});

test('v3 из v2: группы по умолчанию → каталог декора, заглушки и лампады «А-N» заменены, свои позиции сохранены', () => {
  const v2 = clone(STORED); v2.addonsVersion = 2;
  const cat = clone(A.CATEGORY);
  cat.groups = [{ id: 'vases', name: 'Вазы' }, { id: 'lamps', name: 'Лампады' }, { id: 'tables', name: 'Столики и скамьи' }, { id: 'stands', name: 'Подставки' }, { id: 'bronze', name: 'Изделия из бронзы', material: 'бронза' }];
  cat.desc = 'Гранитные вазы, лампады, шары, столики и скамьи из чёрного габбро-диабаза — в тон памятнику.';
  cat.cover = { img: '/api/img?id=28', zoom: 1 };
  v2.categories.push(cat);
  v2.items.push({ cat: 'accessories', code: 'V1', name: 'Ваза «Кубок»', img: '/assets/catalog/V1.webp', price: 100, group: 'vases' });
  v2.items.push({ cat: 'accessories', code: 'T1', name: 'Столик', img: '/api/img?id=40', price: 300, group: 'tables' });
  v2.items.push({ cat: 'accessories', code: 'А-2', img: '/api/img?id=29', price: null, group: 'lamps', studio: true });
  v2.items.push({ cat: 'accessories', code: 'А-3', name: 'Своя лампада', img: '/api/img?id=30', price: null, group: 'lamps' });
  v2.items.push({ cat: 'accessories', code: 'А-4', img: '/api/img?id=31', price: 250, group: 'lamps' });
  const out = A.migrateCatalog(v2), acc = out.categories.find(c => c.id === 'accessories');
  assert.equal(out.addonsVersion, A.VERSION);
  assert.deepEqual(acc.groups.map(g => g.id), A.CATEGORY.groups.map(g => g.id));
  assert.equal(acc.desc, A.DESC);
  assert.deepEqual(acc.cover, { img: A.COVER, zoom: 1 });
  const ai = out.items.filter(i => i.cat === 'accessories'), by = {};
  ai.forEach(i => { by[i.code] = i; });
  assert.ok(!by.V1, 'заглушка с фото по умолчанию заменена');
  assert.ok(!by['А-2'], 'лампада без названия и цены — есть в каталоге');
  assert.equal(by.T1.group, 'other', 'своё фото и цена — позиция остаётся, «Столики» → «Прочее»');
  assert.equal(by['А-3'].group, 'lamps', 'с названием — остаётся');
  assert.equal(by['А-4'].price, 250, 'с ценой — остаётся');
  assert.equal(ai.length, A.ITEMS.length + 3);
  assert.equal(out.items.length - ai.length, STORED.items.length, 'остальные разделы не тронуты');
  assert.equal(A.migrateCatalog(out), out, 'повторно — без изменений');
});

test('v3: свои группы, описание и обложка владельца сохраняются; удалённый раздел не возвращается', () => {
  const v2 = clone(STORED); v2.addonsVersion = 2;
  const cat = clone(A.CATEGORY);
  cat.groups = [{ id: 'mine', name: 'Мои' }, { id: 'vases', name: 'Вазы и вазоны' }];
  cat.desc = 'Своё описание';
  cat.cover = { img: '/assets/catalog/B4.webp', zoom: 1.2 };
  v2.categories.push(cat);
  v2.items.push({ cat: 'accessories', code: 'M1', name: 'Моё', img: '/api/img?id=50', group: 'mine' });
  const out = A.migrateCatalog(v2), acc = out.categories.find(c => c.id === 'accessories');
  assert.deepEqual(acc.groups.slice(0, 2), [{ id: 'mine', name: 'Мои' }, { id: 'vases', name: 'Вазы и вазоны' }]);
  assert.equal(acc.groups.length, 2 + A.CATEGORY.groups.length - 1, 'недостающие группы каталога добавлены');
  assert.equal(acc.desc, 'Своё описание');
  assert.deepEqual(acc.cover, { img: '/assets/catalog/B4.webp', zoom: 1.2 });
  assert.equal(out.items.find(i => i.code === 'M1').group, 'mine');
  // раздел удалён владельцем — не возвращается
  const gone = clone(STORED); gone.addonsVersion = 2;
  const g2 = A.migrateCatalog(gone);
  assert.deepEqual(g2.categories.map(c => c.id), STORED.categories.map(c => c.id));
  assert.equal(g2.items.length, STORED.items.length);
});

test('v2 → v3: из версии 1 описание с серым и красным гранитом исправляется', () => {
  const v1 = clone(STORED); v1.addonsVersion = 1;
  const cat = clone(A.CATEGORY); delete cat.groups;
  cat.desc = 'Гранитные вазы, лампады, шары, столики и скамьи. Камень подбираем в тон памятнику: чёрный габбро-диабаз, серый или красный гранит.';
  v1.categories.push(cat);
  v1.items.push({ cat: 'accessories', code: 'B77', name: 'Своя позиция', group: '', img: '/assets/catalog/y.webp' });
  const out = A.migrateCatalog(v1), acc = out.categories.find(c => c.id === 'accessories');
  assert.equal(acc.desc, A.DESC);
  assert.equal(out.items.find(i => i.code === 'B77').group, '', 'явно «без группы»');
  const own = clone(v1); own.categories.find(c => c.id === 'accessories').desc = 'Камни: чёрный габбро-диабаз, серый или красный гранит.';
  assert.ok(!/серый|красный/i.test(A.migrateCatalog(own).categories.find(c => c.id === 'accessories').desc));
});
