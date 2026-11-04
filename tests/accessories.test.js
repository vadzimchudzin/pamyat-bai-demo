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
  src.items.push({ code: 'V1', cat: 'vertical', img: '/assets/catalog/V1.webp' });
  const out = A.migrateCatalog(src);
  assert.equal(out.items.filter(i => i.code === 'V1').length, 1);
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

test('v2: группы-чипсы, группа позиции по артикулу, описание без серого и красного гранита', () => {
  const v1 = clone(STORED); v1.addonsVersion = 1;
  const cat = clone(A.CATEGORY); delete cat.groups;
  cat.desc = 'Гранитные вазы, лампады, шары, столики и скамьи. Камень подбираем в тон памятнику: чёрный габбро-диабаз, серый или красный гранит.';
  v1.categories.push(cat);
  v1.items = v1.items.concat(A.ITEMS.map(i => { const o = clone(i); delete o.group; return o; }));
  v1.items.push({ cat: 'accessories', code: 'А-9', name: 'Лампада', img: '/assets/catalog/x.webp' });
  v1.items.push({ cat: 'accessories', code: 'B77', name: 'Своя позиция', group: '', img: '/assets/catalog/y.webp' });
  const out = A.migrateCatalog(v1), acc = out.categories.find(c => c.id === 'accessories');
  assert.equal(out.addonsVersion, 2);
  assert.deepEqual(acc.groups.map(g => g.id), ['vases', 'lamps', 'tables', 'stands', 'bronze']);
  assert.ok(!/серый|красный/i.test(acc.desc), acc.desc);
  const g = {}; out.items.filter(i => i.cat === 'accessories').forEach(i => { g[i.code] = i.group; });
  assert.deepEqual(g, { V1: 'vases', V2: 'vases', L1: 'lamps', L2: 'lamps', S1: 'stands', T1: 'tables', T2: 'tables', G1: 'stands', 'А-9': 'lamps', B77: '' });
  assert.equal(out.items.filter(i => i.cat === 'accessories').length, A.ITEMS.length + 2, 'позиции не дублируются');
  // свои группы и описание владельца не трогаем
  const own = clone(out); own.addonsVersion = 1; own.categories.find(c => c.id === 'accessories').groups = [{ id: 'mine', name: 'Мои' }];
  own.categories.find(c => c.id === 'accessories').desc = 'Своё описание';
  const kept = A.migrateCatalog(own).categories.find(c => c.id === 'accessories');
  assert.deepEqual(kept.groups, [{ id: 'mine', name: 'Мои' }]);
  assert.equal(kept.desc, 'Своё описание');
  // раздел удалён владельцем до v2 — не возвращается
  const gone = clone(STORED); gone.addonsVersion = 1;
  assert.deepEqual(A.migrateCatalog(gone).categories.map(c => c.id), STORED.categories.map(c => c.id));
});
