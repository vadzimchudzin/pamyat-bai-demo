'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../api/_lib');
const clone = x => JSON.parse(JSON.stringify(x));
let row = null;
function canonical(x) { if (Array.isArray(x)) return x.map(canonical); if (x && typeof x === 'object') return Object.keys(x).sort().reduce((o,k) => (o[k]=canonical(x[k]),o),{}); return x; }
const eq = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
global.__PAMYAT_DB = { async query(sql, args) {
  if (/select value from kv where key='content'/i.test(sql)) { let val = row === null ? null : clone(row); await new Promise(r => setTimeout(r, 2)); return {rows: val === null ? [] : [{value:val}]}; }
  if (/insert into kv\(key,value,updated_at\) values\('content'/i.test(sql)) { if (row !== null) return {rows:[]}; row = JSON.parse(args[0]); return {rows:[{key:'content'}]}; }
  if (/update kv set value/i.test(sql)) { if (row === null || !eq(row,JSON.parse(args[1]))) return {rows:[]}; row=JSON.parse(args[0]); return {rows:[{key:'content'}]}; }
  return {rows:[]};
}};
test('parallel saves preserve unrelated sections and reject stale edits', async () => {
  const c = await L.getContent(), versions = L.contentVersions(c);
  let [a,b] = await Promise.all([
    L.saveContentSection('texts', {worksTitle:'Наши работы', worksLead:''}, versions.texts),
    L.saveContentSection('contacts', {phone:'123456'}, versions.contacts)
  ]);
  assert.ok(a.content && b.content);
  let result = await L.getContent();
  assert.equal(result.texts.worksTitle,'Наши работы'); assert.equal(result.texts.worksLead,''); assert.equal(result.contacts.phone,'123456');
  assert.equal((await L.saveContentSection('texts',{worksTitle:'Устаревший текст'},versions.texts)).conflict,true);
  assert.equal((await L.getContent()).texts.worksTitle,'Наши работы');
  assert.equal((await L.saveContentSection('texts',{},undefined)).invalid,true);
});
test('canonical versions ignore JSON key order', () => assert.equal(L.sectionVersion({a:1,b:2}),L.sectionVersion({b:2,a:1})));
