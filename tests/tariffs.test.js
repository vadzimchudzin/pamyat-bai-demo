'use strict';
/* Калькулятор по тарифам из смет: цена клиента = площадь × ставка за м² (таблицы владельца). */
const test = require('node:test');
const assert = require('node:assert/strict');
const PP = require('../js/pricing.js');
const T = require('../api/_tariffs.js');

const BASE = { length: 2, width: 1.8, round: 1 };
/* «Цена клиента» из таблиц смет для размеров 1,4×2 … 3×2,2 */
const TABLE = {
  'pkg-paving': [1400, 1575, 1610, 1800, 2000, 2160, 2200, 3300],
  'pkg-tile30': [1848, 2079, 2125, 2376, 2640, 2851, 2904, 4356],
  'pkg-tile60': [1848, 2079, 2125, 2376, 2640, 2851, 2904, 4356]
};
/* Калькулятор в базе до переноса (как на сайте сейчас) */
function liveCalc() {
  return {
    base: { length: 2, width: 1.8, round: 1 },
    dimensions: { enabled: true, min: 0.1, max: 100, step: 0.1, allowSkip: true },
    steps: [
      { id: 'foundation', name: 'Основание', type: 'radio', items: [
        { id: 'concrete', name: 'Армированный бетонный фундамент (Цена указана за 1 м²)', price: 2376, pricing: { mode: 'curve', quantity: 'area', curve: { costFixed: 0, costUnit: 264, markup: 2.5 } } },
        { id: 'ready', name: 'Установка на готовое основание', price: 300, pricing: { mode: 'fixed' } }] },
      { id: 'engraving', name: 'Гравировка', type: 'multi', items: [{ id: 'base', name: 'Базовая', price: 0, note: 'включено', pricing: { mode: 'fixed' } }] },
      { id: 'land', name: 'Благоустройство', type: 'multi', items: [
        { id: 'granite', name: 'Керамогранитная плитка (Цена указана за 1 м²)', price: 460, pricing: { mode: 'fixed' } },
        { id: 'curb', name: 'Бетонный бордюр (Цена указана за м.п)', price: 494, pricing: { mode: 'fixed' } }] },
      { id: 'fence', name: 'Ограда', type: 'radio', items: [{ id: 'none', name: 'Без ограды', price: 0, pricing: { mode: 'fixed' } }] },
      { id: 'decor', name: 'Декор', type: 'multi', items: [{ id: 'vase', name: 'Гранитная ваза', price: 100, pricing: { mode: 'fixed' } }] }
    ]
  };
}
const landOf = c => c.steps.find(s => s.id === 'land');

test('пакеты: цена клиента совпадает с таблицами смет для всех типовых размеров', () => {
  T.PACKAGES.forEach(p => {
    const it = T.packageItem(p, BASE);
    T.SIZES.forEach((s, i) => {
      const r = PP.calcItem(it, PP.dimsOf(s[0], s[1]), { base: BASE });
      assert.equal(r.amount, TABLE[p.id][i], p.id + ' ' + s.join('×'));
    });
  });
});

test('пакеты: ставка строго за м² (500 и 660 BYN), без постоянной части', () => {
  const rates = T.PACKAGES.map(p => PP.linearRate(T.packageItem(p, BASE)));
  assert.deepEqual(rates.map(r => Math.round(r.rate * 100) / 100), [500, 660, 660]);
  rates.forEach(r => assert.equal(r.unit, 'м²'));
  const it = T.packageItem(T.PACKAGES[0], BASE);
  assert.equal(PP.calcItem(it, PP.dimsOf(10, 5), { base: BASE }).amount, 25000);
  assert.equal(PP.calcItem(it, { provided: false }, { base: BASE }).amount, 1800);   // без размеров — базовый участок 3,6 м²
});

test('пакеты: прибыль в базовой точке = цена − мастер − материалы из сметы', () => {
  const p = T.PACKAGES[0], it = T.packageItem(p, BASE), a = PP.analyzeAt(it, PP.dimsOf(2, 1.8), { base: BASE });
  assert.equal(a.price, 1800);
  assert.ok(Math.abs(a.cost - (60 * 3.6 + 301)) < 0.01);
  assert.ok(Math.abs(a.profit - 1283) < 0.01);
});

test('перенос: «Основание» и старое «Благоустройство» заменяются пакетами, остальное не трогаем', () => {
  const c = T.migrateCalc(liveCalc());
  assert.deepEqual(c.steps.map(s => s.id), ['land', 'engraving', 'fence', 'decor']);
  const land = landOf(c);
  assert.equal(land.type, 'radio');
  assert.deepEqual(land.items.map(i => i.id), ['pkg-paving', 'pkg-tile30', 'pkg-tile60', 'ready']);
  assert.equal(land.items[3].price, 300);
  assert.equal(c.tariffVersion, T.VERSION);
  assert.equal(c.dimensions.presets.length, 8);
  assert.equal(c.dimensions.allowSkip, true);
  assert.deepEqual(c.steps[1], liveCalc().steps[1]);
});

test('перенос идемпотентен и не затирает правки админки', () => {
  const once = T.migrateCalc(liveCalc());
  assert.deepEqual(T.migrateCalc(once), once);
  const edited = JSON.parse(JSON.stringify(once));
  landOf(edited).items.splice(1, 1);
  delete edited.tariffVersion;                       // даже если метка потерялась — пакеты уже есть
  const again = T.migrateCalc(edited);
  assert.deepEqual(landOf(again).items.map(i => i.id), ['pkg-paving', 'pkg-tile60', 'ready']);
});

test('публичный контент: без затрат, наценки и таблиц смет', () => {
  const pub = PP.sanitizeCalcForPublic(T.migrateCalc(liveCalc()));
  const json = JSON.stringify(pub);
  assert.ok(!/costUnit|markup|reserve|estimate|materials|master/.test(json));
  const it = landOf(pub).items[0];
  assert.equal(PP.calcItem(it, PP.dimsOf(1.4, 2), { base: BASE }).amount, 1400);
});

test('единицы в названиях: «мп» внутри слов не считается погонным метром', () => {
  assert.equal(PP.inferMode('Комплекс'), 'fixed');
  assert.equal(PP.inferMode('Лампада'), 'fixed');
  assert.equal(PP.inferMode('Бетонный бордюр (Цена указана за м.п)'), 'linear');
  assert.equal(PP.inferMode('Плитка (за 1 м²)'), 'area');
  const it = { id: 'complex', name: 'Комплекс', price: 3300 };
  assert.equal(PP.calcItem(it, PP.dimsOf(2, 2), { base: BASE }).amount, 3300);
});
