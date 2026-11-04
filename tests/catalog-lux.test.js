'use strict';
/* Каталог «люкс» (js/catalog-lux.js): адреса студийных фото, обложки, линзы «Детали»,
   маска фона и кадр для «студии» в админке, настройки вида каталога. */
const test = require('node:test');
const assert = require('node:assert/strict');
const LX = require('../js/catalog-lux.js');

test('адреса фото каталога: новая версия студии и размеры md/sm', () => {
  assert.equal(LX.url('/assets/catalog/B1.webp'), '/assets/catalog/B1.webp?v=' + LX.V);
  assert.equal(LX.url('/assets/catalog/md/B1.webp?v=x4'), '/assets/catalog/B1.webp?v=' + LX.V);
  assert.equal(LX.sized('/assets/catalog/B1.webp', 'sm'), '/assets/catalog/sm/B1.webp?v=' + LX.V);
  assert.equal(LX.sized('/assets/catalog/sm/K12.webp', 'md'), '/assets/catalog/md/K12.webp?v=' + LX.V);
  assert.equal(LX.sized('/api/img?id=7', 'sm'), '/api/img?id=7&w=640');
  assert.equal(LX.sized('/api/img?id=7', 'md'), '/api/img?id=7&w=1600');
  assert.equal(LX.sized('/api/img?id=7&w=300', 'md'), '/api/img?id=7&w=300');
  assert.equal(LX.url('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(LX.url(''), '');
  assert.equal(LX.code('/assets/catalog/cover-fence.webp'), 'cover-fence');
  assert.equal(LX.code('/api/img?id=3'), '');
});

test('студийное фото: файлы каталога и загрузки с флагом studio', () => {
  assert.equal(LX.isStudio('/assets/catalog/C3.webp'), true);
  assert.equal(LX.isStudio('/api/img?id=3'), false);
  assert.equal(LX.isStudio('/api/img?id=3', true), true);
});

test('обложки: старая обложка → студийная, масштаб относительно прежнего', () => {
  const c = LX.cover({ img: '/api/img?id=5', zoom: 1.35, pos: '50% 40%' });
  assert.equal(c.img, '/assets/catalog/cover-complex.webp');
  assert.equal(c.zoom, 1); assert.equal(c.pos, ''); assert.equal(c.studio, true);
  const z = LX.cover({ img: '/api/img?id=8', zoom: 1.8 });
  assert.equal(z.img, '/assets/catalog/cover-vertical.webp'); assert.equal(z.zoom, 1.5);
  assert.equal(LX.cover({ img: '/api/img?id=8', zoom: 0.5 }).zoom, 0.8);
  const own = LX.cover({ img: '/api/img?id=44', zoom: 3, studio: true });
  assert.deepEqual([own.img, own.zoom, own.studio], ['/api/img?id=44', 2.2, true]);
  assert.equal(LX.cover({}).img, '');
});

test('кадр раздела: пропорции подложки', () => {
  assert.equal(LX.stageAr('vertical'), 3 / 4);
  assert.equal(LX.stageAr('horizontal'), 5 / 4);
  assert.equal(LX.stageAr('complex'), 1);
  assert.equal(LX.stageAr('fence'), 3 / 2);
  assert.equal(LX.stageAr('nothing'), 1);
});

test('линза: точка в центре круга совпадает с выбранной (вдали от краёв)', () => {
  for (const ar of [0.75, 1, 1.5]) {
    const f = [0.42, 0.55], c = LX.lensCenter(f, 6.5, ar);
    assert.ok(Math.abs(c[0] - f[0]) < 1e-6 && Math.abs(c[1] - f[1]) < 1e-6, JSON.stringify([ar, c]));
  }
  const L = LX.lens([0, 0], 6.5, 1);
  assert.equal(L.pos, '0.00% 0.00%'); assert.equal(L.size, '650.0% auto');
  const R = LX.lens([1, 1], 6.5, 1);
  assert.equal(R.pos, '100.00% 100.00%');
  // прицел смещает линзу внутрь изделия
  const a = LX.aim('corner', [0.2, 0.1], 6.5, 1);
  assert.ok(a[0] < 0.2 && a[1] > 0.1);
});

test('точки «Детали»: из variants.json и по маске изделия', () => {
  assert.equal(LX.focusList([1, 2, 3]), null);
  assert.equal(LX.focusList([0.1, 0.2, 'x', 0.4, 0.5, 0.6]), null);
  const l = LX.focusList([0.1, 0.2, 0.3, 0.9, 0.5, 0.4]);
  assert.deepEqual(l.map(p => p.key), ['corner', 'base', 'texture']);
  assert.deepEqual(l[1].f, [0.3, 0.9]);
  // прямоугольник 40×60 в кадре 100×100: угол — верх-право (видна боковая грань), основание — низ-право, фактура внутри
  const w = 100, h = 100, a = new Float32Array(w * h);
  for (let y = 20; y < 80; y++) for (let x = 30; x < 70; x++) a[y * w + x] = 1;
  const f = LX.focusFromMask(a, w, h);
  assert.deepEqual(f.slice(0, 4), [0.69, 0.2, 0.69, 0.79]);
  assert.ok(f[4] > 0.3 && f[4] < 0.7 && f[5] > 0.2 && f[5] < 0.8);
  assert.equal(LX.focusFromMask(new Float32Array(16), 4, 4), null);
});

test('«Фактура камня»: резьба внутри изделия, а не гладкая грань; гладкая стела — запасная точка', () => {
  // стела 80×150 в кадре 160×200, на ней в нижней левой части — «резьба» (светлые полосы)
  const w = 160, h = 200, d = new Uint8ClampedArray(w * h * 4), a = new Float32Array(w * h);
  const paint = (carve) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, inside = x >= 40 && x < 120 && y >= 20 && y < 170;
      let c = inside ? 30 : 250;
      if (carve && inside && x >= 52 && x < 80 && y >= 95 && y < 125 && (x >> 2) % 2) c = 170;
      d[o] = d[o + 1] = d[o + 2] = c; d[o + 3] = 255; a[y * w + x] = inside ? 1 : 0;
    }
  };
  paint(true);
  const f = LX.focusFromMask(a, w, h, d);
  assert.ok(f[4] > 0.3 && f[4] < 0.52 && f[5] > 0.45 && f[5] < 0.65, 'точка на резьбе: ' + f.slice(4));
  paint(false);
  const g = LX.focusFromMask(a, w, h, d);
  assert.equal(LX.texturePoint(d, a, w, h, []), null);
  assert.deepEqual(g, LX.focusFromMask(a, w, h));   // без резьбы — как раньше, самая «глубокая» точка
});

function synth(w, h, bg, box, color) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, inside = x >= box[0] && x < box[2] && y >= box[1] && y < box[3];
    const c = inside ? color : bg;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  return d;
}

test('студия: однотонный фон отделяется, изделие и его рамка находятся', () => {
  const w = 120, h = 160, d = synth(w, h, [214, 208, 199], [40, 30, 80, 150], [30, 28, 26]);
  const m = LX.studioMask(d, w, h);
  assert.equal(m.ok, true);
  assert.deepEqual(m.bbox, [40, 30, 80, 150]);
  assert.deepEqual(m.touch, { l: false, r: false, t: false, b: false });
  assert.equal(m.a[5 * w + 5], 0);
  assert.equal(m.a[90 * w + 60], 1);
});

test('студия: срез по краю — только длинный, кончик угла не считается', () => {
  const w = 120, h = 160;
  const cut = LX.studioMask(synth(w, h, [250, 250, 250], [40, 30, 120, 150], [30, 28, 26]), w, h);
  assert.equal(cut.touch.r, true); assert.equal(cut.touch.l, false);
  const d = synth(w, h, [250, 250, 250], [40, 30, 100, 150], [30, 28, 26]);
  for (let y = 80; y < 84; y++) for (let x = 100; x < 120; x++) { const o = (y * w + x) * 4; d[o] = d[o + 1] = d[o + 2] = 30; }
  const tip = LX.studioMask(d, w, h);
  assert.equal(tip.touch.r, false);
});

test('студия: пёстрый фон — без обработки', () => {
  const w = 60, h = 60, d = new Uint8ClampedArray(w * h * 4);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < w * h; i++) { d[i * 4] = rnd() * 255; d[i * 4 + 1] = rnd() * 255; d[i * 4 + 2] = rnd() * 255; d[i * 4 + 3] = 255; }
  const m = LX.studioMask(d, w, h);
  assert.equal(m.ok, false); assert.equal(m.reason, 'busy');
});

test('студия: кадр раздела — изделие по центру на линии пола, мелкое фото не растягивается', () => {
  const L = LX.studioLayout([600, 400, 1400, 2400], 2000, 2600, 'portrait', 2400, {});
  assert.equal(L.H, 2400); assert.equal(L.W, 1800);
  assert.ok(Math.abs(L.ox + L.ow / 2 - L.W / 2) < 1);
  assert.ok(Math.abs(L.floor - 0.915 * L.H) < 1);
  assert.ok(L.oh <= 0.83 * L.H + 1 && L.ow <= 0.70 * L.W + 1);
  // мелкое фото: холст меньше (не меньше 1200 px), изделие увеличено не больше чем в 1,25 раза — или холст минимальный
  const small = LX.studioLayout([400, 300, 800, 1500], 1200, 1600, 'portrait', 2400, {});
  assert.ok(small.H < 2400 && small.H >= 1200);
  assert.ok(small.k <= 1.25 + 1e-9 || small.H === 1200);
  const right = LX.studioLayout([40, 30, 120, 150], 120, 160, 'square', 2400, { r: true });
  assert.ok(Math.abs(right.ox + right.ow - right.W) < 1);
});

test('вид каталога: настройки по умолчанию и проверка значений', () => {
  assert.deepEqual(LX.look({}), { frames: true, motion: 'full', details: true, stage: 'warm' });
  assert.deepEqual(LX.look({ look: { frames: false, motion: 'soft', details: false, stage: 'white' } }), { frames: false, motion: 'soft', details: false, stage: 'white' });
  assert.deepEqual(LX.look({ look: { motion: 'wild', stage: 'neon' } }), { frames: true, motion: 'full', details: true, stage: 'warm' });
  assert.deepEqual(LX.look(null), LX.LOOK);
});

test('разметка: рамка, разделитель, эскиз — без внешних ресурсов', () => {
  assert.match(LX.frame(), /<svg class="lx-fr"/);
  assert.match(LX.rule('x'), /lx-rule x/);
  const sk = LX.sketch();
  assert.match(sk, /^<svg class="lx-sk"/);
  assert.doesNotMatch(sk, /https?:|✦/);
});
