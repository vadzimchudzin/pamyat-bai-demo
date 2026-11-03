'use strict';
/* Настройки оформления (админка → «Оформление»): значения по умолчанию, границы, CSS-переменные и классы. */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/look.js');

test('по умолчанию — согласованные значения', () => {
  const d = L.normalize(null);
  assert.deepEqual(d, L.defaults());
  assert.equal(d.works.peek, 150);
  assert.equal(d.works.shadeHeight, 45);
  assert.equal(d.works.arrows, 'edge');
  assert.equal(d.buttons.rim, true);
  assert.equal(d.lamp.enabled, true);
  assert.equal(d.dove.enabled, true);
  assert.ok(d.dove.gapMin >= 20 && d.dove.gapMax <= 60);
});

test('в каждой группе есть подпись и все ключи SPEC', () => {
  const groups = L.GROUPS.map(g => g[0]);
  L.SPEC.forEach(s => assert.ok(groups.includes(s[0]), 'группа ' + s[0]));
  const d = L.defaults();
  L.SPEC.forEach(s => assert.ok(s[1] in d[s[0]], s[0] + '.' + s[1]));
});

test('числа зажимаются в границы и округляются по шагу, мусор → по умолчанию', () => {
  const n = L.normalize({ works: { peek: 9999, blur: -3, perRow: '3.4', dim: 'abc', arrows: 'nope' }, lamp: { power: '150' }, buttons: { rim: 'false' } });
  assert.equal(n.works.peek, 360);
  assert.equal(n.works.blur, 0);
  assert.equal(n.works.perRow, 3);
  assert.equal(n.works.dim, 30);
  assert.equal(n.works.arrows, 'edge');
  assert.equal(n.lamp.power, 150);
  assert.equal(n.buttons.rim, false);
});

test('пауза голубя «до» не меньше «от»', () => {
  const n = L.normalize({ dove: { gapMin: 60, gapMax: 20 } });
  assert.equal(n.dove.gapMin, 60);
  assert.equal(n.dove.gapMax, 60);
});

test('CSS-переменные и классы', () => {
  const v = L.vars({ works: { peek: 120, shade: 70, shadeHeight: 40 }, buttons: { fire: 25, rimSpeed: 2.5 }, lamp: { power: 140 } });
  assert.equal(v['--wk-peek'], '120px');
  assert.equal(v['--wk-shade'], '0.7');
  assert.equal(v['--wk-shade-h'], '40%');
  assert.equal(v['--fire'], '0.25');
  assert.equal(v['--rim-speed'], '2.5s');
  assert.equal(v['--lamp-power'], '1.4');
  const c = L.classes({ buttons: { rim: false, fire: 0 }, works: { arrows: 'hidden' }, lamp: { enabled: false } });
  assert.equal(c['fx-norim'], true);
  assert.equal(c['fx-nofire'], true);
  assert.equal(c['wk-arrows-hidden'], true);
  assert.equal(c['wk-arrows-fields'], false);
  assert.equal(c['lamp-off'], true);
  const c0 = L.classes(null);
  Object.keys(c0).forEach(k => assert.equal(c0[k], false, k));
});

test('apply без документа возвращает нормализованные настройки', () => {
  const out = L.apply({ dove: { size: 30 } }, null);
  assert.equal(out.dove.size, 30);
});
