/* ПАМЯТЬ.БАЙ — 3D-каталог: каждая модель отрендерена в 5 гранитах (tools/r3d → assets/catalog/3d).
   Карточка: курсор ведут по фото слева направо — меняется гранит (как у etnostone); на телефоне — образцы камня под фото.
   Модель показывается в 3D, только если её фото — исходное фото каталога (/assets/catalog/<код>.webp): своё фото из админки важнее.
   Граниты можно выключать и переименовывать в админке (catalog.stoneSet — весь сайт, раздел.stoneOff — только раздел):
   если в разделе включён один гранит — показывается одно фото без смены камня.
   Чистые функции (адреса, выбор варианта по курсору, манифест, настройки гранитов) проверяются в tests/catalog-3d.test.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pamyat3D = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BASE = '/assets/catalog/3d/';
  var ASSET = /^\/assets\/catalog\/(?:md\/|sm\/)?([A-Za-z0-9_-]+)\.webp(?:[?#].*)?$/;
  var HEX = /^#[0-9a-f]{3,8}$/i, TEX = /^sw\/[a-z]+\.jpg$/;
  var M = null, CBS = [], ASKED = false;
  var P = { names: {}, off: {}, cat: {} }; // настройки гранитов из админки

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  // манифест index.json: { v, res, rs: { код: px }, variants: [{ id, name, swatch, tex }], codes: [...] }
  function set(man) {
    var vs = man && Array.isArray(man.variants) ? man.variants.filter(function (x) { return x && /^[a-z]+$/.test(x.id || '') && x.name; }) : [];
    if (!vs.length || !Array.isArray(man.codes)) { M = null; return null; }
    M = { v: String(man.v || ''), res: +man.res > 0 ? +man.res : 1000, rs: {}, codes: {},
      variants: vs.map(function (x) {
        return { id: x.id, name: String(x.name), swatch: HEX.test(x.swatch || '') ? x.swatch : '#777', tex: TEX.test(x.tex || '') ? x.tex : '' };
      }) };
    man.codes.forEach(function (c) { if (/^[A-Za-z0-9_-]+$/.test(c || '')) M.codes[c] = 1; });
    if (man.rs && typeof man.rs === 'object') Object.keys(man.rs).forEach(function (c) { var r = +man.rs[c]; if (M.codes[c] && r > 0) M.rs[c] = r; });
    return M;
  }
  // настройки из каталога (админка): { stoneSet: { names: { id: имя }, off: [id] }, categories: [{ id, stoneOff: [id] }] }
  function prefs(K) {
    var s = K && K.stoneSet && typeof K.stoneSet === 'object' ? K.stoneSet : {}, p = { names: {}, off: {}, cat: {} };
    if (s.names && typeof s.names === 'object') Object.keys(s.names).forEach(function (id) { var n = String(s.names[id] == null ? '' : s.names[id]).trim(); if (n) p.names[id] = n.slice(0, 60); });
    (Array.isArray(s.off) ? s.off : []).forEach(function (id) { p.off[id] = 1; });
    (K && Array.isArray(K.categories) ? K.categories : []).forEach(function (c) {
      if (c && c.id && Array.isArray(c.stoneOff) && c.stoneOff.length) { var o = p.cat[c.id] = {}; c.stoneOff.forEach(function (id) { o[id] = 1; }); }
    });
    P = p; return p;
  }
  // граниты раздела: без выключенных, с названиями из админки; хотя бы один (первый из манифеста) остаётся всегда
  function variants(cat) {
    if (!M) return [];
    var co = (cat && P.cat[cat]) || {};
    var all = M.variants.map(function (x) { return { id: x.id, name: P.names[x.id] || x.name, swatch: x.swatch, tex: x.tex }; });
    var on = all.filter(function (x) { return !P.off[x.id] && !co[x.id]; });
    return on.length ? on : all.slice(0, 1);
  }
  // код 3D-модели по фото позиции: только исходное фото каталога, для которого есть рендер
  function codeOf(img) { var m = ASSET.exec(img || ''); return m && M && M.codes[m[1]] ? m[1] : ''; }
  function res(code) { return M ? M.rs[code] || M.res : 1000; }
  function src(code, vid, size) { return BASE + (size === 'sm' ? 'sm/' : '') + code + '-' + vid + '.webp' + (M && M.v ? '?v=' + encodeURIComponent(M.v) : ''); }
  function srcset(code, vid) { var r = res(code); return src(code, vid, 'sm') + ' ' + Math.round(r / 2) + 'w, ' + src(code, vid) + ' ' + r + 'w'; }
  // образец камня: фото фактуры (sw/<id>.jpg) поверх цвета
  function swatchCss(x) { return '--c:' + x.swatch + (x.tex ? ";--t:url('" + BASE + x.tex + (M && M.v ? '?v=' + encodeURIComponent(M.v) : '') + "')" : ''); }
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
  // слои: базовый (первый включённый гранит) — сразу, остальные догружаются при первом наведении или нажатии на образец.
  // cat — раздел каталога (выключенные в нём граниты не показываются)
  function stage(code, alt, sizes, big, cat) {
    var vs = variants(cat), v0 = vs[0];
    if (!v0) return '';
    var a = ' srcset="' + esc(srcset(code, v0.id)) + '" sizes="' + esc(sizes) + '"';
    return '<span class="r3w"' + (cat ? ' data-c="' + esc(cat) + '"' : '') + '><img class="r3v on" data-k="0" src="' + esc(src(code, v0.id, big ? '' : 'sm')) + '"' + a +
      (big ? '' : ' loading="lazy"') + ' decoding="async" alt="' + esc(alt) + '"></span>' +
      (vs.length > 1 ? '<span class="r3-nm" aria-hidden="true">' + esc(v0.name) + '</span>' : '');
  }
  function dots(label, cat) {
    // <div>, не <span>: на телефоне dusk.css прячет подписи карточек «.mc .t span».
    // Карточка в сетке сама кнопка (role=button), поэтому кружки — только для мыши и пальца (вне порядка Tab, скрыты от чтения с экрана);
    // с клавиатуры и экранным диктором гранит выбирают в карточке модели (swatches).
    var vs = variants(cat); if (vs.length < 2) return '';
    return '<div class="r3-dots" aria-hidden="true"' + (label ? ' title="' + esc(label) + '"' : '') + '>' + vs.map(function (x, k) {
      return '<button type="button" tabindex="-1" data-r3k="' + k + '" title="' + esc(x.name) + '" aria-pressed="' + (k ? 'false' : 'true') + '" style="' + swatchCss(x) + '"></button>';
    }).join('') + '</div>';
  }
  function swatches(cat) {
    var vs = variants(cat); if (vs.length < 2) return '';
    return '<div class="r3-sw" role="group" aria-label="Гранит">' + vs.map(function (x, k) {
      return '<button type="button" data-r3k="' + k + '" aria-pressed="' + (k ? 'false' : 'true') + '"><i style="' + swatchCss(x) + '"></i><span>' + esc(x.name) + '</span></button>';
    }).join('') + '</div>';
  }

  /* ---------- поведение ---------- */
  function catOf(st) { var w = st && st.querySelector('.r3w'); return w ? w.getAttribute('data-c') || '' : ''; }
  function layers(st) {
    if (st._r3) return st._r3;
    var w = st.querySelector('.r3w'), b = w && w.querySelector('img'), code = st.getAttribute('data-r3'), vs = variants(catOf(st));
    var o = st._r3 = { k: 0, pin: 0, im: [b], vs: vs };
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
    var o = layers(st), vs = o.vs; if (!vs[k]) return;
    if (pin) o.pin = k;
    o.k = k;
    o.im.forEach(function (im, i) { if (i) im.classList.toggle('on', i === k); });
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
      st._r3h = true; if (layers(st).vs.length < 2) return;
      st.addEventListener('pointermove', function (ev) {
        if (ev.pointerType === 'touch') return;
        var r = st.getBoundingClientRect(); st.classList.add('r3-on');
        var k = pick(ev.clientX - r.left, r.width, layers(st).vs.length); if (k !== current(st)) show(st, k);
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

  return { BASE: BASE, set: set, prefs: prefs, load: load, variants: variants, codeOf: codeOf, res: res, src: src, srcset: srcset, pick: pick,
    stage: stage, dots: dots, swatches: swatches, swatchCss: swatchCss, bind: bind, show: show, current: current, esc: esc,
    has: function (code) { return !!(M && M.codes[code]); }, manifest: function () { return M; },
    settled: function () { return ASKED === 'done'; } };
});
