'use strict';
/* Сценарий калькулятора: порядок шагов и тексты интерфейса из админки. */
const test = require('node:test');
const assert = require('node:assert/strict');
const CF = require('../js/calc-flow.js');

test('по умолчанию: памятник, размеры, затем шаги в исходном порядке', () => {
  assert.deepEqual(CF.sequence(['land', 'tile', 'extra']), ['@monument', '@dimensions', 'land', 'tile', 'extra']);
});

test('сохранённый порядок применяется, неизвестные и повторы отбрасываются', () => {
  const seq = CF.sequence(['land', 'tile', 'extra'], { order: ['tile', '@dimensions', 'ghost', 'tile', '@monument', 'land'] });
  assert.deepEqual(seq, ['tile', '@dimensions', '@monument', 'land', 'extra']);
});

test('новые шаги — в конец, недостающие блоки — на привычные места', () => {
  assert.deepEqual(CF.sequence(['a', 'b', 'c'], { order: ['b', 'a'] }), ['@monument', '@dimensions', 'b', 'a', 'c']);
  assert.deepEqual(CF.sequence(['a', 'b'], { order: ['b', '@monument', 'a'] }), ['b', '@monument', '@dimensions', 'a']);
});

test('старый шаг «monument» из списка шагов не дублирует блок памятника', () => {
  assert.deepEqual(CF.sequence(['monument', 'land']), ['@monument', '@dimensions', 'land']);
});

test('блоки можно исключить', () => {
  assert.deepEqual(CF.sequence(['land'], { monument: false }), ['@dimensions', 'land']);
  assert.deepEqual(CF.sequence(['land'], { dimensions: false, order: ['land', '@dimensions'] }), ['@monument', 'land']);
});

test('тексты: значения по умолчанию, пустые строки и пробелы', () => {
  const U = CF.normalizeUi({ contact: { title: '  Свой   заголовок ', button: '' }, monument: { enabled: false }, summary: { note: null } });
  assert.equal(U.contact.title, 'Свой заголовок');
  assert.equal(U.contact.button, CF.DEFAULTS.contact.button);
  assert.equal(U.monument.enabled, false);
  assert.equal(U.monument.name, CF.DEFAULTS.monument.name);
  assert.equal(U.summary.note, CF.DEFAULTS.summary.note);
  assert.equal(U.contact.comment, true);
  assert.deepEqual(U.order, []);
});

test('normalizeUi без данных — копия значений по умолчанию', () => {
  const U = CF.normalizeUi(undefined);
  assert.deepEqual(U.contact, CF.DEFAULTS.contact);
  assert.deepEqual(U.dimensions, CF.DEFAULTS.dimensions);
  U.contact.title = 'x';
  assert.notEqual(CF.DEFAULTS.contact.title, 'x');
});
