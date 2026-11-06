'use strict';
/* Каталог (js/catalog-x.js): группы-чипсы, скидки, бейджи, 3D-модель на обложке раздела. */
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/catalog-x.js');

const ACC = { id: 'accessories', name: 'Аксессуары', calc: false };
const ITEMS = [{ code: 'V1' }, { code: 'V2' }, { code: 'L1' }, { code: 'L2' }, { code: 'А-9' }, { code: 'T1' }, { code: 'T2' }, { code: 'G1' }, { code: 'X5' }];

test('аксессуары: группы по умолчанию и позиции по артикулу', () => {
  assert.deepEqual(X.groups(ACC).filter(g => !g.parent).map(g => g.id), ['vases', 'pots', 'lamps', 'parts', 'sculpture', 'decor', 'bronze', 'granite', 'other', 'stands']);
  assert.deepEqual(ITEMS.map(it => X.groupOf(it, ACC)), ['vases', 'vases', 'lamps', 'lamps', 'lamps', 'other', 'other', 'other', '']);
  // пустые группы на сайте не показываются; n — вместе с подгруппами
  assert.deepEqual(X.usedGroups(ACC, ITEMS).map(g => g.id + ':' + g.n), ['vases:2', 'lamps:3', 'other:3']);
  assert.deepEqual(X.inGroup(ITEMS, ACC, 'lamps').map(it => it.code), ['L1', 'L2', 'А-9']);
  assert.equal(X.inGroup(ITEMS, ACC, '').length, ITEMS.length, '«Все»');
});

test('подгруппы: чипсы второго уровня, позиции группы вместе с подгруппами, материал и описание', () => {
  const list = [
    { code: 'В001', group: 'vases-black' }, { code: 'В401', group: 'vases-gold' }, { code: 'В402', group: 'vases-gold' },
    { code: 'V9', group: 'vases' }, { code: 'П001', group: 'lamps-marble' }, { code: 'К252', group: 'bronze-crosses', material: 'латунь' }
  ];
  const used = X.usedGroups(ACC, list);
  assert.deepEqual(used.map(g => g.id + ':' + g.n), ['vases:4', 'lamps:1', 'bronze:1']);
  assert.deepEqual(used[0].kids.map(k => k.id + ':' + k.n), ['vases-black:1', 'vases-gold:2'], 'пустые подгруппы не показываются');
  assert.equal(used[1].kids.length, 1);
  assert.deepEqual(X.inGroup(list, ACC, 'vases').map(i => i.code), ['В001', 'В401', 'В402', 'V9']);
  assert.deepEqual(X.inGroup(list, ACC, 'vases-gold').map(i => i.code), ['В401', 'В402']);
  assert.equal(X.topOf(ACC, 'vases-gold'), 'vases');
  assert.equal(X.topOf(ACC, 'lamps'), 'lamps');
  assert.equal(X.topOf(ACC, 'nope'), '');
  assert.equal(X.materialOf(list[0], ACC), 'полимергранит', 'материал группы — у подгруппы');
  assert.equal(X.materialOf(list[4], ACC), 'литьевой мрамор', 'свой материал подгруппы');
  assert.equal(X.materialOf(list[5], ACC), 'латунь', 'материал позиции важнее');
  assert.equal(X.materialOf({ code: 'Z1' }, ACC), '');
  assert.match(X.descOf(ACC, 'vases-gold'), /семи цветах/, 'описание группы — у подгруппы без своего');
  assert.match(X.descOf(ACC, 'vases-marble'), /Белые вазы/);
  assert.equal(X.descOf(ACC, ''), '');
});

test('подгруппы из админки: только у группы верхнего уровня, описание обрезается', () => {
  const c = { id: 'accessories', groups: [
    { id: 'a', name: 'А', desc: '  ' }, { id: 'a1', name: 'А1', parent: 'a', desc: ' Текст ' }, { id: 'a2', name: 'А2', parent: 'a1' },
    { id: 'b', name: 'Б', parent: 'b' }, { id: 'c', name: 'В', parent: 'gone' }, { id: 'd', name: 'Г', parent: 'bad id' }] };
  assert.deepEqual(X.groups(c), [
    { id: 'a', name: 'А' }, { id: 'a1', name: 'А1', parent: 'a', desc: 'Текст' }, { id: 'a2', name: 'А2' },
    { id: 'b', name: 'Б' }, { id: 'c', name: 'В' }, { id: 'd', name: 'Г' }]);
  assert.equal(X.groups({ id: 'accessories', groups: [{ id: 'x', name: 'X', desc: 'я'.repeat(400) }] })[0].desc.length, 300);
});

test('свои группы из админки: порядок, проверка, «без группы»', () => {
  const c = { id: 'accessories', groups: [{ id: 'bronze', name: ' Бронза ' }, { id: 'bad id', name: 'x' }, { id: 'vases', name: '' }, { id: 'bronze', name: 'дубль' }, { id: 'lamps', name: 'Лампады' }] };
  assert.deepEqual(X.groups(c), [{ id: 'bronze', name: 'Бронза' }, { id: 'lamps', name: 'Лампады' }]);
  assert.equal(X.groupOf({ code: 'V1' }, c), '', 'группы заданы — по артикулу больше не раскладываем');
  assert.equal(X.groupOf({ code: 'L1', group: 'lamps' }, c), 'lamps');
  assert.equal(X.groupOf({ code: 'L1', group: 'gone' }, c), '', 'удалённая группа');
  assert.equal(X.groupOf({ code: 'L1', group: '' }, ACC), '', 'явно «без группы»');
  assert.deepEqual(X.groups({ id: 'vertical' }), []);
  assert.deepEqual(X.groups(null), []);
});

test('скидка: позиция важнее раздела, 0 — без скидки, границы', () => {
  const c = { discount: 15 };
  assert.equal(X.pct({}, c), 15);
  assert.equal(X.pct({ discount: 20 }, c), 20);
  assert.equal(X.pct({ discount: 0 }, c), 0, 'у позиции явно без скидки');
  assert.equal(X.pct({ discount: '' }, c), 15, 'пусто — как у раздела');
  assert.equal(X.pct({ discount: 'abc' }, c), 15);
  assert.equal(X.pct({}, { discount: 120 }), 95);
  assert.equal(X.pct({}, { discount: -5 }), 0);
  assert.equal(X.pct({}, { discount: '12.6' }), 13);
  assert.equal(X.pct(null, null), 0);
  assert.equal(X.sale(1200, 15), 1020);
  assert.equal(X.sale(999, 0), 999);
  assert.equal(X.sale(null, 10), null);
});

test('цена со скидкой: новая и зачёркнутая старая', () => {
  const f = n => String(n);
  assert.equal(X.priceHtml(1200, 0, f), 'от 1200 BYN');
  assert.equal(X.priceHtml(1200, 15, f), 'от 1020 BYN <s class="cx-old">1200 BYN</s>');
  assert.equal(X.priceHtml(null, 15, f), '');
  assert.equal(X.priceHtml('', 15, f), '');
  assert.equal(X.priceHtml('850', 10, f), 'от 765 BYN <s class="cx-old">850 BYN</s>');
});

test('бейдж: свой текст важнее скидки, тон, экранирование', () => {
  assert.deepEqual(X.badge({}, 10), { text: '−10%', tone: 'sale' });
  assert.deepEqual(X.badge({ badge: { text: 'Хит', tone: 'dark' } }, 10), { text: 'Хит', tone: 'dark' });
  assert.deepEqual(X.badge({ badge: { text: 'Новинка', tone: 'nope' } }, 0), { text: 'Новинка', tone: 'gold' });
  assert.deepEqual(X.badge({ badge: 'Акция' }, 0), { text: 'Акция', tone: 'gold' });
  assert.equal(X.badge({ badge: { text: '  ' } }, 0), null);
  assert.equal(X.badge(null, 0), null);
  assert.equal(X.badgeHtml({ text: '<b>', tone: 'gold' }), '<span class="cx-badge" data-tone="gold">&lt;b&gt;</span>');
  assert.equal(X.badgeHtml(null), '');
});

test('3D на обложке: своя модель, фото без 3D, исходное фото, модель по умолчанию', () => {
  const has = { B7: 1, I26: 1, P3: 1, O10: 1 };
  const R3 = { has: c => !!has[c], codeOf: u => { const m = /^\/assets\/catalog\/([A-Z]\d+)\.webp$/.exec(u || ''); return m && has[m[1]] ? m[1] : ''; } };
  assert.equal(X.coverCode({ id: 'vertical', cover: { img: '/api/img?id=8' } }, R3), 'B7', 'похожая модель');
  assert.equal(X.coverCode({ id: 'vertical', cover: { img: '/api/img?id=8', r3: '' } }, R3), '', 'в админке выбрано фото');
  assert.equal(X.coverCode({ id: 'vertical', cover: { img: '/api/img?id=8', r3: 'P3' } }, R3), 'P3');
  assert.equal(X.coverCode({ id: 'vertical', cover: { r3: 'Z9' } }, R3), '', 'нет рендера');
  assert.equal(X.coverCode({ id: 'horizontal', cover: { img: '/assets/catalog/I26.webp' } }, R3), 'I26');
  assert.equal(X.coverCode({ id: 'fence', cover: { img: '/api/img?id=9' } }, R3), 'O10');
  assert.equal(X.coverCode({ id: 'complex', cover: { img: '/api/img?id=5' } }, R3), '', 'комплексы — фото');
  assert.equal(X.coverCode({ id: 'accessories', calc: false, cover: { img: '/assets/catalog/I26.webp' } }, R3), '');
  assert.equal(X.coverCode({ id: 'cross', stones: false, cover: { img: '/assets/catalog/P3.webp' } }, R3), '');
  assert.equal(X.coverCode({ id: 'vertical' }, null), '');
  assert.equal(X.r3ok({ id: 'fence' }), true);
  assert.equal(X.r3ok({ id: 'fence', calc: false }), true, 'ограды вне калькулятора — всё равно 3D');
  assert.equal(X.r3ok({ id: 'accessories', calc: false }), false);
  assert.equal(X.r3ok({ id: 'complex', stones: true }), true);
});

test('цена может быть без «от», в том числе со скидкой', () => {
  const f = n => String(n);
  assert.equal(X.priceHtml(123.45, 0, f, false), '123.45 BYN');
  assert.equal(X.priceHtml(100, 10, f, false), '90 BYN <s class="cx-old">100 BYN</s>');
  assert.equal(X.priceHtml(100, 0, f, true), 'от 100 BYN');
});
