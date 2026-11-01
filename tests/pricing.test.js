'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PP = require('../js/pricing.js');

const BASE = { length: 2, width: 1.8, round: 1 };
const D = (l, w) => PP.dimsOf(l, w);
// Пример из админки: постоянные 290, переменные (900−290)/3,6 за м², наценка ×2,5 → 2250 BYN на 2,0×1,8
function curveItem(over) {
  return {
    id: 'x', name: 'Заливка + плитка', price: 2250,
    pricing: { mode: 'curve', quantity: 'area', curve: Object.assign({ share: 1, piece: 0, costFixed: 290, costUnit: 610 / 3.6, reserve: 0, markup: 2.5, min: 0,
      trim: { enabled: false, tileA: 60, tileB: 50, material: 0, cut: 0 } }, over || {}) }
  };
}
const price = (it, d, opts) => PP.calcItem(it, d, Object.assign({ base: BASE }, opts || {})).amount;

test('фиксированная позиция не зависит от размеров', () => {
  const it = { id: 'a', name: 'Установка', price: 200, pricing: { mode: 'fixed' } };
  assert.equal(price(it, D(2, 1.8)), 200);
  assert.equal(price(it, D(5, 5)), 200);
});

test('кривая: цена в базовой точке = 2250', () => {
  assert.equal(price(curveItem(), D(2, 1.8)), 2250);
});

test('кривая: без размеров считается цена базового участка', () => {
  assert.equal(price(curveItem(), { provided: false }), 2250);
});

test('кривая: итоговая цена растёт, цена за м² падает, маржа 60%', () => {
  const it = curveItem(); let prev = 0, prevPer = Infinity;
  [0.4, 0.6, 0.8, 1, 1.3, 1.7, 2.2, 3].forEach((s) => {
    const a = PP.analyzeAt(it, D(2 * s, 1.8 * s), { base: BASE });
    assert.ok(a.price > prev, 'цена должна расти');
    assert.ok(a.perM2 < prevPer, 'цена за м² должна падать');
    assert.ok(Math.abs(a.margin - 0.6) < 0.01, 'маржа ~60%, получено ' + a.margin);
    prev = a.price; prevPer = a.perM2;
  });
});

test('кривая: контрольные значения таблицы', () => {
  const it = curveItem();
  assert.equal(price(it, D(1, 1)), 1149);
  assert.equal(price(it, D(2, 3)), 3267);
});

test('резерв увеличивает цену, минимальная сумма её ограничивает', () => {
  const withReserve = curveItem({ reserve: 10 });
  assert.equal(price(withReserve, D(2, 1.8), { ignoreStoredPrice: true }), 2475);
  const withMin = curveItem({ min: 3000 });
  assert.equal(price(withMin, D(0.5, 0.5), { ignoreStoredPrice: true }), 3000);
});

test('подрезка плитки: ровная раскладка без отхода', () => {
  const t = PP.trimInfo(D(2, 1.8), 50, 60);
  assert.equal(t.tiles, 12);
  assert.equal(t.wasteArea, 0);
  assert.equal(t.cutLen, 0);
});

test('подрезка плитки: отход и рез увеличивают цену', () => {
  const trim = { enabled: true, tileA: 60, tileB: 30, material: 55, cut: 10 };
  const t = PP.trimInfo(D(2.2, 1.4), 60, 30);
  assert.equal(t.tiles, 20);
  assert.ok(Math.abs(t.wasteArea - 0.52) < 0.02);
  assert.ok(Math.abs(t.cutLen - 3.6) < 0.05);
  const plain = curveItem({ costFixed: 0, costUnit: 100, markup: 1, trim: Object.assign({}, trim, { enabled: false }) });
  const trimmed = curveItem({ costFixed: 0, costUnit: 100, markup: 1, trim });
  const out = PP.calcItem(trimmed, D(2.2, 1.4), { base: BASE, ignoreStoredPrice: true });
  assert.ok(out.amount > price(plain, D(2.2, 1.4), { ignoreStoredPrice: true }));
  assert.ok(out.trimAmount > 0);
  assert.equal(Math.round((out.mainAmount + out.trimAmount) * 100), Math.round(out.amount * 100));
});

test('количество округляется до целых элементов', () => {
  const it = curveItem({ costFixed: 0, costUnit: 10, markup: 1, piece: 0.5, share: 1 });
  it.pricing.quantity = 'perimeter';
  // периметр 2×(1,2+1) = 4,4 → 4,5 м × 10
  assert.equal(price(it, D(1.2, 1), { ignoreStoredPrice: true }), 45);
});

test('цена из прайс-листа масштабирует всю кривую', () => {
  const it = curveItem();
  assert.equal(price(it, D(2, 1.8), { basePrice: 2475 }), 2475);
  const scaled = price(it, D(4, 3.6), { basePrice: 2475 });
  const plain = price(it, D(4, 3.6));
  assert.ok(Math.abs(scaled / plain - 2475 / 2250) < 0.01);
});

test('шаг округления 10 BYN не считается «подменой» цены', () => {
  const base = { length: 2, width: 1.8, round: 10 };
  const it = curveItem(); it.price = 2250;
  assert.equal(PP.calcItem(it, D(2, 1.8), { base }).amount, 2250);
  assert.equal(PP.calcItem(it, D(2.4, 2), { base }).amount % 10, 0);
});

test('старая схема «за м²» работает как раньше', () => {
  const it = { id: 'c', name: 'Цветник', price: 400, pricing: { mode: 'area', coefficient: { enabled: false } } };
  assert.equal(price(it, D(2, 1.8)), 1440);
  assert.equal(price(it, { provided: false }), 400);
});

test('публичный контент не содержит затрат, резерва и наценки', () => {
  const calc = { base: BASE, steps: [{ id: 's', name: 'Основание', items: [curveItem({ reserve: 10, trim: { enabled: true, tileA: 60, tileB: 50, material: 55, cut: 10 } })] }] };
  const pub = PP.sanitizeCalcForPublic(calc);
  const json = JSON.stringify(pub);
  ['costFixed', 'costUnit', 'markup', 'reserve', '"material"', '"cut":10'].forEach((k) => assert.ok(!json.includes(k), 'утечка: ' + k));
  assert.equal(JSON.stringify(calc).includes('costFixed'), true, 'исходный объект не изменён');
  // публичная версия считает ту же цену
  const it = pub.steps[0].items[0];
  const orig = calc.steps[0].items[0];
  [D(2, 1.8), D(3, 2.5), D(1.2, 1)].forEach((d) => {
    assert.equal(PP.calcItem(it, d, { base: BASE }).amount, PP.calcItem(orig, d, { base: BASE }).amount);
  });
});

test('заметка для клиента не раскрывает затраты', () => {
  const it = curveItem({ trim: { enabled: true, tileA: 60, tileB: 30, material: 55, cut: 10 } });
  const out = PP.calcItem(it, D(2.2, 1.4), { base: BASE });
  assert.ok(!/наценк|себестоим|затрат|резерв/i.test(out.note));
});
