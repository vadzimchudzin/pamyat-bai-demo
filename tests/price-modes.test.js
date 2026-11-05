/* Калькулятор: режимы цены позиции — «за шт.» (клиент выбирает количество), единица цены для подписи, «от». */
const test = require('node:test');
const assert = require('node:assert/strict');
const PP = require('../js/pricing.js');

const vase = { id: 'vase', name: 'Ваза', price: 100, from: true, pricing: { mode: 'piece', maxQty: 4 } };
const dims = PP.dimsOf(3, 2);

test('«за шт.»: режим и максимум количества (по умолчанию 10, 1…99)', () => {
  assert.equal(PP.normalizePricing(vase).mode, 'piece');
  assert.equal(PP.normalizePricing(vase).maxQty, 4);
  assert.equal(PP.normalizePricing({ price: 5, pricing: { mode: 'piece' } }).maxQty, 10);
  assert.equal(PP.normalizePricing({ price: 5, pricing: { mode: 'piece', maxQty: 500 } }).maxQty, 99);
  assert.equal(PP.normalizePricing({ price: 5, pricing: { mode: 'piece', maxQty: 0 } }).maxQty, 1);
  assert.equal(PP.normalizePricing({ price: 5, pricing: { mode: 'fixed' } }).maxQty, null);
});

test('«за шт.»: цена × количество, размеры участка не влияют', () => {
  const r = PP.calcItem(vase, dims, { qty: 3 });
  assert.equal(r.amount, 300);
  assert.equal(r.quantity, 3);
  assert.equal(r.unit, 'шт.');
  assert.equal(r.base, 100);
  assert.equal(r.mode, 'piece');
  assert.equal(PP.calcItem(vase, { provided: false }, { qty: 3 }).amount, 300);
  assert.equal(PP.calcItem(vase, dims).amount, 100, 'без количества — 1 шт.');
  assert.equal(PP.calcItem(vase, dims, { qty: 50 }).amount, 400, 'не больше максимума');
  assert.equal(PP.calcItem({ price: null, pricing: { mode: 'piece' } }, dims, { qty: 2 }).amount, null, 'без цены — индивидуальный расчёт');
  assert.equal(PP.calcItem(vase, dims, { qty: 2, basePrice: 120 }).amount, 240, 'цена из прайса финансов');
});

test('количество: целое 1…max', () => {
  assert.equal(PP.pieceQty(undefined, 10), 1);
  assert.equal(PP.pieceQty(0, 10), 1);
  assert.equal(PP.pieceQty(-3, 10), 1);
  assert.equal(PP.pieceQty('abc', 10), 1);
  assert.equal(PP.pieceQty(3.6, 10), 4);
  assert.equal(PP.pieceQty(1000, 10), 10);
  assert.equal(PP.pieceQty(5), 5);
});

test('единица цены для подписи «… BYN/ед.»', () => {
  const rate = (q, extra) => ({ price: 0, pricing: { mode: 'curve', simple: true, quantity: q, curve: Object.assign({ share: 1, piece: 0, costFixed: 0, costUnit: 50, reserve: 0, markup: 1, min: 0 }, extra || {}) } });
  assert.equal(PP.priceUnit({ price: 10, pricing: { mode: 'fixed' } }), '');
  assert.equal(PP.priceUnit(vase), 'шт.');
  assert.equal(PP.priceUnit(rate('area')), 'м²');
  assert.equal(PP.priceUnit(rate('perimeter')), 'м.п.');
  assert.equal(PP.priceUnit(rate('area', { costFixed: 300 })), '', 'кривая с постоянными затратами — цена за всё');
});

test('публичный контент: «за шт.» и «от» не теряются', () => {
  const pub = PP.sanitizeCalcForPublic({ steps: [{ id: 'extra', name: 'Дополнительно', type: 'multi', items: [vase] }] });
  const it = pub.steps[0].items[0];
  assert.equal(it.from, true);
  assert.deepEqual(it.pricing, { mode: 'piece', maxQty: 4 });
  assert.equal(it.price, 100);
});
