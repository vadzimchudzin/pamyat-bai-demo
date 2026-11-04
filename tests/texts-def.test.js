'use strict';
/* Тексты главной: реестр админки (js/texts-def.js) ↔ разметка index.html (data-t) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../js/texts-def.js');
const HTML = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('каждый ключ — ровно один элемент без вложенной разметки, текст по умолчанию совпадает', () => {
  for (const k of T.keys()) {
    const re = new RegExp('data-t="' + k + '"[^>]*>([^<]*)<', 'g'), all = [...HTML.matchAll(re)];
    assert.equal(all.length, 1, k);
    assert.equal(all[0][1], T.defaults()[k], k);
  }
});

test('в разметке нет data-t вне реестра, ключи не повторяются', () => {
  const inHtml = [...HTML.matchAll(/data-t="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual([...inHtml].sort(), [...T.keys()].sort());
  assert.equal(new Set(T.keys()).size, T.keys().length);
});

test('прежние семь ключей на месте', () => {
  for (const k of ['heroTitle', 'heroLead', 'worksLead', 'manifesto', 'priceNote', 'calcTitle', 'calcLead']) assert.ok(T.keys().includes(k), k);
});
