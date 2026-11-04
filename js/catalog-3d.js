/* ПАМЯТЬ.БАЙ — 3D-каталог: каждая модель отрендерена в 5 гранитах (tools/r3d → assets/catalog/3d).
   Карточка: курсор ведут по фото слева направо — меняется гранит (как у etnostone); на телефоне — образцы камня под фото.
   Модель показывается в 3D, только если её фото — исходное фото каталога (/assets/catalog/<код>.webp): своё фото из админки важнее.
   Чистые функции (адреса, выбор варианта по курсору, манифест) проверяются в tests/catalog-3d.test.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pamyat3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BASE = '/assets/catalog/3d/';
  var ASSET = /^\/assets\/catalog\/(?:md\/|sm\/)?([A-Za-z0-9_-]+)\.webp(?:[?#].*)?$/;
  var HEX = /^#[0-9a-f]{3,8}$/i;
  var M = null, CBS = [], ASKED = false;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  // манифест index.json: { v, res, variants: [{ id, name, swatch }], codes: [...] }
  function set(man) {
    var vs = man && Array.isArray(man.variants) ? man.variants.filter(function (x) { return x && /^[a-z]+$/.test(x.id || '') && x.name; }) : [];
    if (!vs.length || !Array.isArray(man.codes)) { M = null; return null; }
    M = { v: String(man.v || ''), res: +man.res > 0 ? +man.res : 1000, codes: {},
      variants: vs.map(function (x) { return { id: x.id, name: String(x.name), swatch: HEX.test(x.swatch || '') ? x.swatch : '#777' }; }) };
    man.codes.forEach(function (c) { if (/^[A-Za-z0-9_-]+$/.test(c || '')) M.codes[c] = 1; });
    return M;
  }
  function variants() { return M ? M.variants : []; }
  // код 3D-модели по фото позиции: только исходное фото каталога, для которого есть рендер
  function codeOf(img) { var m = ASSET.exec(img || ''); return m && M && M.codes[m[1]] ? m[1] : ''; }
  function src(code, vid, size) { return BASE + (size === 'sm' ? 'sm/' : '') + code + '-' + vid + '.webp' + (M && M.v ? '?v=' + encodeURIComponent(M.v) : ''); }
  function srcset(code, vid) { var r = M ? M.res : 1000; return src(code, vid, 'sm') + ' ' + Math.round(r / 2) + 'w, ' + src(code, vid) + ' ' + r + 'w'; }
  // вариант по положению курсора: ширина фото делится на равные полосы
  function pick(x, w, n) { if (!(w > 0) || !(n > 0)) return 0; var k = Math.floor(x / w * n); return k < 0 ? 0 : k >= n ? n - 1 : k; }

  function load(cb) {
    if (cb) { if (M || ASKED === 'done') cb(M); else CBS.push(cb); }
    if (ASKED || typeof fetch !== 'function') return;
    ASKED = true;
    var done = function (j) {
      set(j); ASKED = 'done'; var l = CBS; CBS = []; l.forEach(function (f) { try { f(M); } catch (e) {} });
      if (M && typeof document !== 'undefined') try { document.dispatchEvent(new CustomEvent('pamyat:3d', { detail: M })); } catch (e) {}
    };
    fetch(BASE + 'index.json').then(function (r) { return r.ok ? r.json() : null; }).then(done, function () { done(null); });
  }

  /* ---------- разметка ---------- */
  // слои: базовый (габбро-диабаз) — сразу, остальные граниты догружаются при первом наведении или нажатии на образец
  function stage(code, alt, sizes, big) {
    var vs = variants(), v0 = vs[0];
    if (!v0) return '';
    var a = ' srcset="' + esc(srcset(code, v0.id)) + '" sizes="' + esc(sizes) + '"';
    return '<span class="r3w"><img class="r3v on" data-k="0" src="' + esc(src(code, v0.id, big ? '' : 'sm')) + '"' + a +
      (big ? '' : ' loading="lazy"') + ' decoding="async" alt="' + esc(alt) + '"></span>' +
      '<span class="r3-bar" aria-hidden="true">' + vs.map(function (x, k) { return '<i' + (k ? '' : ' class="on"') + ' style="--c:' + x.swatch + '"></i>'; }).join('') + '</span>' +
      '<span class="r3-nm" aria-hidden="true">' + esc(v0.name) + '</span>';
  }
  function dots(label) {
    // <div>, не <span>: на телефоне dusk.css прячет подписи карточек «.mc .t span»
    return '<div class="r3-dots" role="group" aria-label="' + esc(label || 'Гранит') + '">' + variants().map(function (x, k) {
      return '<button type="button" data-r3k="' + k + '" aria-label="' + esc(x.name) + '" aria-pressed="' + (k ? 'false' : 'true') + '" style="--c:' + x.swatch + '"></button>';
    }).join('') + '</div>';
  }
  function swatches() {
    return '<div class="r3-sw" role="group" aria-label="Гранит">' + variants().map(function (x, k) {
      return '<button type="button" data-r3k="' + k + '" aria-pressed="' + (k ? 'false' : 'true') + '"><i style="background:' + x.swatch + '"></i><span>' + esc(x.name) + '</span></button>';
    }).join('') + '</div>';
  }

  /* ---------- поведение ---------- */
  function layers(st) {
    if (st._r3) return st._r3;
    var w = st.querySelector('.r3w'), b = w && w.querySelector('img'), code = st.getAttribute('data-r3'), vs = variants();
    var o = st._r3 = { k: 0, pin: 0, im: [b] };
    if (!b || !code) return o;
    for (var k = 1; k < vs.length; k++) {
      var im = document.createElement('img');
      im.className = 'r3v'; im.setAttribute('data-k', k); im.alt = ''; im.setAttribute('aria-hidden', 'true'); im.decoding = 'async';
      if (b.getAttribute('sizes')) { im.setAttribute('sizes', b.getAttribute('sizes')); im.setAttribute('srcset', srcset(code, vs[k].id)); }
      im.src = src(code, vs[k].id, /\/sm\//.test(b.getAttribute('src') || '') ? 'sm' : '');
      w.appendChild(im); o.im.push(im);
    }
    return o;
  }
  function holder(st) { return st.closest('.mc, .clb') || st.parentNode; }
  function show(st, k, pin) {
    var o = layers(st), vs = variants(); if (!vs[k]) return;
    if (pin) o.pin = k;
    o.k = k;
    o.im.forEach(function (im, i) { if (i) im.classList.toggle('on', i === k); });
    [].forEach.call(st.querySelectorAll('.r3-bar i'), function (e, i) { e.classList.toggle('on', i === k); });
    var nm = st.querySelector('.r3-nm'); if (nm) nm.textContent = vs[k].name;
    var h = holder(st);
    if (h) [].forEach.call(h.querySelectorAll('[data-r3k]'), function (b) {
      var i = +b.getAttribute('data-r3k'); b.setAttribute('aria-pressed', i === o.pin ? 'true' : 'false'); b.classList.toggle('hv', i === k);
    });
    if (pin && st.getAttribute('data-r3-label')) { var b0 = o.im[0]; if (b0) b0.alt = st.getAttribute('data-r3-label') + ' — ' + vs[k].name; }
  }
  function current(st) { var o = st && st._r3; return o ? o.k : 0; }
  function bind(rootEl) {
    if (!rootEl || rootEl._r3b) return; rootEl._r3b = true;
    var stageOf = function (e) { return e.target.closest && e.target.closest('[data-r3]'); };
    rootEl.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'touch') return;
      var st = stageOf(e); if (!st || st._r3h) return;
      st._r3h = true; layers(st);
      st.addEventListener('pointermove', function (ev) {
        if (ev.pointerType === 'touch') return;
        var r = st.getBoundingClientRect(); st.classList.add('r3-on');
        var k = pick(ev.clientX - r.left, r.width, variants().length); if (k !== current(st)) show(st, k);
      });
      st.addEventListener('pointerleave', function () { st.classList.remove('r3-on'); var o = st._r3; if (o && o.k !== o.pin) show(st, o.pin); });
    });
    // образцы камня внутри карточки: не открывают карточку модели (фаза захвата — раньше обработчика карточки)
    rootEl.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-r3k]'); if (!b) return;
      e.stopPropagation(); e.preventDefault();
      var h = b.closest('.mc, .clb'), st = h && h.querySelector('[data-r3]'); if (st) show(st, +b.getAttribute('data-r3k'), true);
    }, true);
    rootEl.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[data-r3k]')) e.stopPropagation();
    }, true);
  }

  return { BASE: BASE, set: set, load: load, variants: variants, codeOf: codeOf, src: src, srcset: srcset, pick: pick,
    stage: stage, dots: dots, swatches: swatches, bind: bind, show: show, current: current, esc: esc,
    has: function (code) { return !!(M && M.codes[code]); }, manifest: function () { return M; },
    settled: function () { return ASKED === 'done'; } };
});
