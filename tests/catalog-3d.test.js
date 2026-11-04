'use strict';
/* 3D-каталог (js/catalog-3d.js): манифест рендеров, адреса картинок, выбор гранита по курсору, разметка. */
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/catalog-3d.js');

const MAN = {
  v: '41802443026', res: 1000,
  variants: [
    { id: 'black', name: 'Габбро-диабаз', swatch: '#1e1e20' },
    { id: 'gray', name: 'Серый гранит', swatch: '#737372' },
    { id: 'red', name: 'Красный гранит', swatch: '#86453a' },
    { id: 'brown', name: 'Коричневый гранит', swatch: '#5c392b' },
    { id: 'green', name: 'Зелёный гранит', swatch: '#28382b' }
  ],
  codes: ['A1', 'B4', 'F24']
};

test('без манифеста 3D нет: фото каталога остаются', () => {
  R.set(null);
  assert.equal(R.codeOf('/assets/catalog/B4.webp'), '');
  assert.deepEqual(R.variants(), []);
  assert.equal(R.stage('B4', 'Памятник B4', '300px'), '');
  assert.equal(R.set({ variants: [], codes: ['B4'] }), null);
  assert.equal(R.set({ variants: MAN.variants }), null, 'нет списка кодов');
});

test('манифест: проверка вариантов и кодов', () => {
  const m = R.set({
    v: 7, res: 'x',
    variants: [{ id: 'black', name: 'Габбро', swatch: 'url(x)' }, { id: 'Bad id', name: 'x' }, { id: 'red' }, { id: 'gray', name: 'Серый', swatch: '#737372' }],
    codes: ['B4', '../x', '', null, 'H5']
  });
  assert.equal(m.v, '7');
  assert.equal(m.res, 1000, 'неверный размер — 1000 по умолчанию');
  assert.deepEqual(R.variants().map(x => x.id), ['black', 'gray']);
  assert.equal(R.variants()[0].swatch, '#777', 'цвет образца — только #hex');
  assert.ok(R.has('B4') && R.has('H5') && !R.has('../x'));
});

test('модель в 3D только с исходным фото каталога', () => {
  R.set(MAN);
  assert.equal(R.codeOf('/assets/catalog/B4.webp'), 'B4');
  assert.equal(R.codeOf('/assets/catalog/md/B4.webp?v=3'), 'B4');
  assert.equal(R.codeOf('/assets/catalog/sm/F24.webp'), 'F24');
  assert.equal(R.codeOf('/assets/catalog/H5.webp'), '', 'рендера нет');
  assert.equal(R.codeOf('/api/img/abc123'), '', 'своё фото из админки важнее');
  assert.equal(R.codeOf('https://cdn.example.com/assets/catalog/B4.webp'), '');
  assert.equal(R.codeOf(''), '');
  assert.equal(R.codeOf(undefined), '');
});

test('адреса рендеров: размер и версия прогона', () => {
  R.set(MAN);
  assert.equal(R.src('B4', 'red'), '/assets/catalog/3d/B4-red.webp?v=41802443026');
  assert.equal(R.src('B4', 'red', 'sm'), '/assets/catalog/3d/sm/B4-red.webp?v=41802443026');
  assert.equal(R.srcset('A1', 'black'), '/assets/catalog/3d/sm/A1-black.webp?v=41802443026 500w, /assets/catalog/3d/A1-black.webp?v=41802443026 1000w');
});

test('гранит по положению курсора: равные полосы, края не выходят за список', () => {
  assert.equal(R.pick(0, 250, 5), 0);
  assert.equal(R.pick(49.9, 250, 5), 0);
  assert.equal(R.pick(50, 250, 5), 1);
  assert.equal(R.pick(124, 250, 5), 2);
  assert.equal(R.pick(249, 250, 5), 4);
  assert.equal(R.pick(250, 250, 5), 4);
  assert.equal(R.pick(-10, 250, 5), 0);
  assert.equal(R.pick(400, 250, 5), 4);
  assert.equal(R.pick(10, 0, 5), 0);
  assert.equal(R.pick(10, 250, 0), 0);
});

test('разметка: базовый слой, полосы, экранирование подписи', () => {
  R.set(MAN);
  const h = R.stage('B4', 'Памятник "B4" <1>', '(max-width:720px) 46vw, 300px');
  assert.match(h, /^<span class="r3w"><img class="r3v on" data-k="0" src="\/assets\/catalog\/3d\/sm\/B4-black\.webp\?v=41802443026"/);
  assert.match(h, /loading="lazy"/);
  assert.match(h, /alt="Памятник &quot;B4&quot; &lt;1&gt;"/);
  assert.equal((h.match(/<i /g) || []).length, 5, 'полоса на каждый гранит');
  assert.match(h, /<span class="r3-nm" aria-hidden="true">Габбро-диабаз<\/span>$/);
  const big = R.stage('B4', 'x', '560px', true);
  assert.match(big, /src="\/assets\/catalog\/3d\/B4-black\.webp\?v=/, 'в карточке модели — крупный рендер');
  assert.doesNotMatch(big, /loading="lazy"/);
});

test('образцы: кнопки с подписями, выбран первый', () => {
  R.set(MAN);
  const d = R.dots('B4: выбрать гранит');
  assert.match(d, /^<div class="r3-dots" aria-hidden="true" title="B4: выбрать гранит">/, 'div: на телефоне подписи-span скрыты');
  assert.equal((d.match(/<button type="button" tabindex="-1"/g) || []).length, 5, 'внутри карточки-кнопки — вне порядка Tab');
  assert.equal((d.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(d, /data-r3k="4" title="Зелёный гранит" aria-pressed="false" style="--c:#28382b"/);
  const s = R.swatches();
  assert.equal((s.match(/<span>/g) || []).length, 5);
  assert.match(s, /<span>Коричневый гранит<\/span>/);
});

function freshModule() { delete require.cache[require.resolve('../js/catalog-3d.js')]; return require('../js/catalog-3d.js'); }
const tick = () => new Promise(r => setTimeout(r, 0));

test('загрузка манифеста: один запрос, все колбэки, settled()', async () => {
  const saved = global.fetch, calls = [];
  global.fetch = u => { calls.push(u); return Promise.resolve({ ok: true, json: () => Promise.resolve(MAN) }); };
  try {
    const R2 = freshModule(), got = [];
    assert.equal(R2.settled(), false);
    R2.load(m => got.push(m.codes.B4)); R2.load(() => got.push(2)); R2.load();
    await tick();
    assert.deepEqual(calls, ['/assets/catalog/3d/index.json']);
    assert.ok(R2.settled());
    assert.deepEqual(got, [1, 2]);
    R2.load(() => got.push(3));
    assert.deepEqual(got, [1, 2, 3], 'манифест уже есть — колбэк сразу');
    assert.equal(R2.codeOf('/assets/catalog/A1.webp'), 'A1');
  } finally { global.fetch = saved; }
});

test('манифест не загрузился — каталог остаётся с фото', async () => {
  const saved = global.fetch;
  global.fetch = () => Promise.resolve({ ok: false, status: 404 });
  try {
    const R2 = freshModule(); let got = 'none';
    R2.load(m => { got = m; });
    await tick();
    assert.ok(R2.settled());
    assert.equal(got, null);
    assert.equal(R2.codeOf('/assets/catalog/B4.webp'), '');
  } finally { global.fetch = saved; }
});
