/* ПАМЯТЬ.БАЙ — поведение главной: шапка, свет лампады, визуализация, калькулятор, формы */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* предпросмотр из админки (iframe /?preview=works,…): данные приходят из админки, заявки не отправляются */
  var PREVIEW = (function () { try { return window.parent !== window ? /[?&]preview=([a-z,]+)/.exec(location.search) : null; } catch (e) { return null; } })();
  if (PREVIEW) {
    window.PAMYAT_DEMO = true;
    root.classList.add('is-preview');
    PREVIEW[1].split(',').forEach(function (k) { root.classList.add('pv-' + k); });
  }
  var LOOK = window.PamyatLook || null;
  function look(group, key, def) { var L = LOOK ? LOOK.get() : null, v = L && L[group] ? L[group][key] : undefined; return v === undefined ? def : v; }

  /* Lenis: restrained wheel inertia, with native touch scrolling and reduced-motion support. */
  var scrollEngine = null;
  if (!calm && typeof window.Lenis === 'function') {
    try {
      scrollEngine = new window.Lenis({
        lerp: 0.08,
        smoothWheel: true,
        wheelMultiplier: 0.9,
        touchMultiplier: 1,
        syncTouch: false,
        anchors: true,
        autoRaf: true,
        respectReducedMotion: true,
        overscroll: true
      });
      window.PAMYAT_LENIS = scrollEngine;
    } catch (error) {
      scrollEngine = null;
    }
  }

  function smoothPageScroll(target, options) {
    if (scrollEngine) {
      scrollEngine.scrollTo(target, Object.assign({ duration: 0.72 }, options || {}));
      return;
    }
    var behavior = calm ? 'auto' : 'smooth';
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: behavior });
    } else {
      window.scrollTo({ top: Number(target) || 0, behavior: behavior });
    }
  }

  /* Small scroll-linked image drift: separate from hover zoom and the hero's slow camera animation. */
  var parallaxFrame = 0;
  function scheduleImageParallax() {
    if (calm || parallaxFrame) return;
    parallaxFrame = requestAnimationFrame(function () {
      parallaxFrame = 0;
      var viewport = window.innerHeight || document.documentElement.clientHeight || 800;
      var heroCanvas = $('.hero .canvas');
      var heroSection = heroCanvas && heroCanvas.closest('.hero');
      if (heroSection) {
        var heroTop = heroSection.getBoundingClientRect().top;
        var heroY = Math.max(-38, Math.min(0, heroTop * 0.11));
        heroCanvas.style.setProperty('--pamyat-hero-y', heroY.toFixed(2) + 'px');
      }
      $$('.works-carousel .work-photo-main, .cc .cover img').forEach(function (img) {
        var frame = img.closest('.mat, .cover') || img.parentElement;
        if (!frame) return;
        var rect = frame.getBoundingClientRect();
        if (rect.bottom < -60 || rect.top > viewport + 60) {
          img.style.setProperty('--pamyat-image-y', '0px');
          return;
        }
        var center = rect.top + rect.height / 2;
        var ratio = (viewport / 2 - center) / (viewport / 2 + rect.height / 2);
        var limit = img.matches('.cc .cover img') ? 10 : 5;
        var offset = Math.max(-limit, Math.min(limit, ratio * limit));
        img.style.setProperty('--pamyat-image-y', offset.toFixed(2) + 'px');
      });
    });
  }
  window.addEventListener('scroll', scheduleImageParallax, { passive: true });
  window.addEventListener('resize', scheduleImageParallax, { passive: true });
  if (scrollEngine) scrollEngine.on('scroll', scheduleImageParallax);
  scheduleImageParallax();

  /* ---------- шапка + тепло лампады по скроллу ---------- */
  var top = $('#top'), hero = $('#hero');
  /* меню на телефоне */
  (function () {
    var b = $('#burger'), tp = $('#top'); if (!b || !tp) return;
    b.addEventListener('click', function () { var o = tp.classList.toggle('open'); b.setAttribute('aria-expanded', o); });
    $$('.menu a', tp).forEach(function (a) { a.addEventListener('click', function () { tp.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }); });
    document.addEventListener('click', function (e) { if (!tp.contains(e.target)) tp.classList.remove('open'); });
  })();

  /* фон — одно полотно: верх светлый, середина — переход в сумерки.
     Каждый блок берёт цвет фона под собой и выбирает режим, где текст контрастнее: tone-l (тёмный текст,
     светлое стекло) или tone-d (светлый текст, тёмное стекло). Никаких «серых на сером» в переходе. */
  var EDGE = 0.47, CATPAGE = document.body.classList.contains('catpage');
  var STOPS = [[0, '#ede2d2'], [.2, '#ebdfce'], [.36, '#e4d5c0'], [.41, '#d6c2a8'], [.45, '#c0a68a'], [.49, '#9f8670'], [.53, '#7a6453'],
    [.57, '#55463b'], [.61, '#3b312b'], [.72, '#302823'], [.85, '#352820'], [.94, '#432b1d'], [1, '#4d2f1c']];
  function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function stops(H) {
    if (!CATPAGE) return STOPS;
    var f = function (px) { return Math.min(1, Math.max(0, px / H)); };
    return [[0, '#ede2d2'], [.4, '#e9ddcb'], [f(H - 640), '#e4d5c0'], [f(H - 470), '#c0a68a'], [f(H - 360), '#7a6453'], [f(H - 240), '#3b312b'], [1, '#4d2f1c']];
  }
  function bgAt(p, S) {
    for (var i = 1; i < S.length; i++) if (p <= S[i][0]) {
      var a = hex(S[i - 1][1]), b = hex(S[i][1]), t = (p - S[i - 1][0]) / ((S[i][0] - S[i - 1][0]) || 1);
      return a.map(function (v, k) { return v + (b[k] - v) * t; });
    }
    return hex(S[S.length - 1][1]);
  }
  function lum(c) { var l = c.map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  var DARK = hex('#241e17'), LIGHT = hex('#f6f1ea');
  function themes() {
    var H = document.documentElement.scrollHeight, S = stops(H);
    $$('main > section:not(.hero), main .head, main .glass, main .note, footer').forEach(function (el) {
      var fixed = el.closest('[data-tone]'), mode, low = false;
      if (fixed) mode = fixed.dataset.tone;
      else {
        var r = el.getBoundingClientRect(), y = r.top + scrollY + Math.min(r.height, innerHeight) * 0.5;
        var bg = bgAt(y / H, S), cd = contrast(bg, DARK), cl = contrast(bg, LIGHT);
        mode = cd >= cl ? 'l' : 'd'; low = Math.max(cd, cl) < 6;
      }
      el.classList.toggle('tone-l', mode === 'l'); el.classList.toggle('tone-d', mode !== 'l');
      el.classList.toggle('tsh', low && !el.classList.contains('glass'));
    });
    if (window.pamyatLamp) window.pamyatLamp.refresh();
  }
  function onScroll() {
    var h = hero ? hero.offsetHeight : 600;
    if (top) {
      top.classList.toggle('scrolled', hero ? scrollY > h * 0.55 : scrollY > 24);
      var SH = document.documentElement.scrollHeight;
      top.classList.toggle('dk', CATPAGE ? scrollY + 40 > SH - 420 : (scrollY + 40) / SH > EDGE + 0.03);
    }
  }
  themes(); onScroll();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', function () { themes(); onScroll(); });
  addEventListener('load', themes);

  /* пламя лампады «дышит» CSS-анимацией (css/polish.css), отсветы на элементах — js/lamp.js:
     без записи переменных в :root каждые 65–210 мс (это пересчитывало стили всей страницы) */

  /* ---------- облака заслоняют солнце: яркость солнца и лучей гаснет под облаком ---------- */
  (function () {
    var heroEl = $('#hero'), sun = heroEl && $('.sun .core', heroEl), clouds = heroEl ? $$('.sky .cl', heroEl) : [];
    if (!sun || !clouds.length) return;
    var maps = {}, GW = 160, GH = 68, cur = 1;
    function grid(src, cb) {
      if (maps[src]) return cb(maps[src]);
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = GW; c.height = GH;
          var x = c.getContext('2d'); x.drawImage(im, 0, 0, GW, GH);
          var d = x.getImageData(0, 0, GW, GH).data, a = new Float32Array(GW * GH);
          for (var i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
          maps[src] = a; cb(a);
        } catch (e) { }
      };
      im.src = src;
    }
    /* у каждого слоя — «окна» без облаков: облака идут группами, солнце то открыто, то закрыто */
    var GAPS = { c1: [0, .1, .45, .55, .6, .95, 1], c2: [.04, .16, .34, .44, .58, .7, .86, .96], c3: [.08, .2, .38, .5, .62, .74, .9, 1] };
    function maskAt(cls, u) {                  // плавная маска: пары [вход, полное, полное, выход]
      var g = GAPS[cls]; if (!g || cls === 'c1') return 1;
      for (var i = 0; i + 3 < g.length; i += 4) {
        var a = g[i], b = g[i + 1], c = g[i + 2], d = g[i + 3];
        if (u >= a && u <= d) return u < b ? (u - a) / (b - a) : u > c ? (d - u) / (d - c) : 1;
      }
      return 0;
    }
    clouds.forEach(function (el) {
      var cls = ['c1', 'c2', 'c3'].filter(function (k) { return el.classList.contains(k); })[0], g = GAPS[cls];
      if (g && cls !== 'c1') {
        var st = []; for (var i = 0; i + 3 < g.length; i += 4) st.push('transparent ' + g[i] * 100 + '%', '#000 ' + g[i + 1] * 100 + '%', '#000 ' + g[i + 2] * 100 + '%', 'transparent ' + g[i + 3] * 100 + '%');
        var mk = 'linear-gradient(90deg,transparent 0%,' + st.join(',') + ',transparent 100%)';
        el.style.webkitMaskImage = mk; el.style.maskImage = mk; el._cls = cls;
      }
      var m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage);
      if (m) grid(m[1], function (a) { el._a = a; });
    });
    function sample(a, u, v) {           // среднее по пятну ~ размер солнечного диска
      var s = 0, n = 0;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -3; dx <= 3; dx++) {
        var x = Math.round(u * (GW - 1)) + dx, y = Math.round(v * (GH - 1)) + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        s += a[y * GW + x]; n++;
      }
      return n ? s / n : 0;
    }
    function step() {
      var r = sun.getBoundingClientRect(), sx = r.left + r.width / 2, sy = r.top + r.height / 2;
      var clear = 1;
      clouds.forEach(function (el) {
        if (!el._a) return;
        var b = el.getBoundingClientRect();
        if (sx < b.left || sx > b.right || sy < b.top || sy > b.bottom) return;
        var u = (sx - b.left) / b.width, v = (sy - b.top) / b.height;
        var mu = u;                                                   // маска считается до зеркалирования
        if (el.classList.contains('c3')) u = 1 - u;                 // зеркальное облако
        var op = parseFloat(getComputedStyle(el).opacity) || 0;
        var mf = el._cls ? maskAt(el._cls, el.classList.contains('c3') ? 1 - mu : mu) : 1;
        var w = el._cls ? 1.2 : 0.25;                               // перистые облака почти не гасят солнце
        clear *= 1 - Math.min(1, sample(el._a, u, v) * op * mf * w);
      });
      var target = 0.18 + 0.82 * clear;                              // под облаком солнце почти гаснет
      cur += (target - cur) * 0.08;
      heroEl.style.setProperty('--sun', cur.toFixed(3));
    }
    var last = 0;
    (function loop(t) {
      if (t - last > 60 && heroEl.getBoundingClientRect().bottom > 0) { last = t; step(); }
      requestAnimationFrame(loop);
    })(0);
  })();

  /* ---------- появление блоков ---------- */
  if ('IntersectionObserver' in window && !calm) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    $$('.rv').forEach(function (el) { io.observe(el); });
  } else $$('.rv').forEach(function (el) { el.classList.add('in'); });

  /* ---------- лайтбокс работ ---------- */
  var lbx = $('#lbx');
  function openWork(w) {
    var img = w && w.querySelector('.mat .work-photo-main, .mat img');
    if (img && lbx && $('#lbimg')) { $('#lbimg').src = img.src; lbx.classList.add('on'); }
  }

  /* ---------- карусель примеров работ ----------
     Бесконечная лента: по краям — копии работ (.is-clone), после остановки прокрутки позиция незаметно
     переносится на тот же кадр среди настоящих карточек. В полях слева и справа видны соседние кадры,
     точки — по одной на каждую работу. */
  var worksCarousel = $('#worksCarousel'), worksTrack = $('#worksGrid');
  var worksPrev = worksCarousel && $('.works-prev', worksCarousel);
  var worksNext = worksCarousel && $('.works-next', worksCarousel);
  var worksPagination = worksCarousel && $('#worksPagination');
  var WL = { n: 0, k: 0, v: 0, idx: 0, target: null, touch: false, t: 0, rt: 0 };
  function worksPad(side) { return worksTrack ? parseFloat(getComputedStyle(worksTrack)['padding' + side]) || 0 : 0; }
  function worksGap() {
    if (!worksTrack) return 0;
    var st = getComputedStyle(worksTrack);
    return parseFloat(st.columnGap || st.gap) || 0;
  }
  function worksStep() {
    var card = worksTrack && $('.work', worksTrack);
    return card ? card.getBoundingClientRect().width + worksGap() : 0;
  }
  function worksVisible(step) {
    var view = worksTrack.clientWidth - worksPad('Left') - worksPad('Right');
    return step > 0 ? Math.max(1, Math.round((view + worksGap()) / step)) : 1;
  }
  /* Поля ленты: на компьютере — до края контента, но не шире «видно соседних карточек» из админки
     (на широких экранах лента не тянется во всю ширину), на телефоне — 11% ширины. */
  function worksLayout() {
    if (!worksCarousel) return;
    var vw = document.documentElement.clientWidth || innerWidth, wrap = worksCarousel.parentElement;
    var cs = wrap ? getComputedStyle(wrap) : null;
    var inner = wrap ? wrap.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) : vw;
    var peek = Math.max(0, Number(look('works', 'peek', 150)) || 0);
    var full = vw <= 640 ? Math.round(Math.max(24, vw * 0.11)) : Math.max(16, Math.round((vw - inner) / 2));
    var pad = vw <= 640 ? Math.max(16, Math.min(full, Math.max(peek, 16))) : Math.max(16, Math.min(full, peek));
    var w = vw <= 640 ? vw : Math.min(vw, Math.round(inner + 2 * pad));
    worksCarousel.style.setProperty('--vw', vw + 'px');
    worksCarousel.style.setProperty('--wk-w', w + 'px');
    worksCarousel.style.setProperty('--wk-pad', pad + 'px');
  }
  function worksInstant(left) {
    var sb = worksTrack.style.scrollBehavior;
    worksTrack.style.scrollBehavior = 'auto';
    worksTrack.scrollLeft = left;
    worksTrack.style.scrollBehavior = sb;
  }
  function worksIndex() {
    var step = worksStep(); if (!step || !WL.n) return 0;
    var i = Math.round(worksTrack.scrollLeft / step) - WL.k;
    return WL.k ? ((i % WL.n) + WL.n) % WL.n : Math.max(0, Math.min(WL.n - 1, i));
  }
  function worksClone(el) {
    var c = el.cloneNode(true);
    c.classList.add('is-clone'); c.setAttribute('aria-hidden', 'true');
    $$('[id]', c).forEach(function (x) { x.removeAttribute('id'); });
    $$('img', c).forEach(function (im) { im.loading = 'eager'; });
    return c;
  }
  function setupWorks(keepIdx) {
    if (!worksTrack) return;
    worksLayout();
    $$('.work.is-clone', worksTrack).forEach(function (c) { c.parentNode.removeChild(c); });
    var real = $$('.work', worksTrack), n = real.length, step = worksStep(), v = worksVisible(step);
    WL.n = n; WL.v = v; WL.k = 0; WL.target = null;
    if (n > v) {
      var k = Math.min(n, v + 2), pre = document.createDocumentFragment(), post = document.createDocumentFragment();
      real.slice(n - k).forEach(function (el) { pre.appendChild(worksClone(el)); });
      real.slice(0, k).forEach(function (el) { post.appendChild(worksClone(el)); });
      worksTrack.insertBefore(pre, worksTrack.firstChild);
      worksTrack.appendChild(post);
      WL.k = k;
    }
    WL.idx = Math.max(0, Math.min(Math.max(0, n - 1), keepIdx == null ? WL.idx : keepIdx));
    worksInstant((WL.idx + WL.k) * step);
    refreshWorksCarousel();
  }
  function refreshWorksCarousel() {
    if (!worksCarousel || !worksTrack) return;
    var loop = WL.k > 0, active = worksIndex();
    worksCarousel.classList.toggle('is-scrollable', loop);
    worksCarousel.classList.toggle('can-left', loop);
    worksCarousel.classList.toggle('can-right', loop);
    [worksPrev, worksNext].forEach(function (b) {
      if (!b) return;
      b.hidden = !loop; b.disabled = !loop; b.setAttribute('aria-disabled', String(!loop));
    });
    if (worksPagination) {
      var pages = loop ? WL.n : 1;
      if (Number(worksPagination.dataset.pageCount) !== pages) {
        worksPagination.dataset.pageCount = String(pages);
        worksPagination.innerHTML = Array.from({ length: pages }, function (_, i) {
          return '<button type="button" class="works-dot" data-page="' + i + '" aria-label="Показать работу ' + (i + 1) + '"></button>';
        }).join('');
        worksPagination.hidden = pages < 2;
      }
      $$('.works-dot', worksPagination).forEach(function (dot, i) {
        var on = i === active;
        dot.classList.toggle('active', on);
        if (on) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
      });
    }
  }
  function worksGo(t, step) {
    WL.target = t;
    worksTrack.scrollTo({ left: t * step, behavior: calm ? 'auto' : 'smooth' });
    worksSettleLater();
  }
  function moveWorks(direction) {
    if (!worksTrack) return;
    var step = worksStep(); if (!step) return;
    var t = (WL.target != null ? WL.target : Math.round(worksTrack.scrollLeft / step)) + direction;
    if (WL.k) {
      var i = t - WL.k;
      if (i < -1 || i > WL.n) { // запас копий кончился — переносимся на круг назад/вперёд, не прерывая движения
        var shift = i < -1 ? WL.n : -WL.n;
        worksInstant(worksTrack.scrollLeft + shift * step); t += shift;
      }
    } else t = Math.max(0, Math.min(Math.max(0, WL.n - WL.v), t));
    worksGo(t, step);
  }
  function worksSettle() {
    clearTimeout(WL.t); WL.t = 0;
    if (!worksTrack) return;
    if (WL.touch) return worksSettleLater();
    WL.target = null;
    var step = worksStep();
    if (WL.k && WL.n && step) {
      var i = Math.round(worksTrack.scrollLeft / step) - WL.k;
      if (i < 0 || i >= WL.n) worksInstant(worksTrack.scrollLeft + ((((i % WL.n) + WL.n) % WL.n) - i) * step);
    }
    WL.idx = worksIndex();
    refreshWorksCarousel();
  }
  function worksSettleLater() { clearTimeout(WL.t); WL.t = setTimeout(worksSettle, 160); }
  function worksResize() {
    clearTimeout(WL.rt);
    WL.rt = setTimeout(function () {
      if (!worksTrack) return;
      worksLayout();
      var step = worksStep(), real = $$('.work:not(.is-clone)', worksTrack).length;
      if (worksVisible(step) !== WL.v || real !== WL.n) setupWorks(WL.idx);
      else if (step) { worksInstant((WL.idx + WL.k) * step); refreshWorksCarousel(); }
    }, 120);
  }
  /* автопрокрутка (админка → «Оформление»): пауза при наведении, фокусе, касании и вне экрана */
  var WA = { t: 0, hold: false, seen: true };
  function worksAutoplay() {
    clearInterval(WA.t); WA.t = 0;
    var sec = Number(look('works', 'autoplay', 0)) || 0;
    if (!sec || calm || !worksTrack) return;
    WA.t = setInterval(function () {
      if (WA.hold || WL.touch || document.hidden || !WA.seen || !WL.k) return;
      moveWorks(1);
    }, Math.max(2, sec) * 1000);
  }
  if (worksCarousel) {
    ['pointerenter', 'focusin'].forEach(function (ev) { worksCarousel.addEventListener(ev, function () { WA.hold = true; }); });
    ['pointerleave', 'focusout'].forEach(function (ev) { worksCarousel.addEventListener(ev, function () { WA.hold = false; }); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { WA.seen = es[0] ? es[0].isIntersecting : true; }, { threshold: 0.35 }).observe(worksCarousel);
    document.addEventListener('pamyat:look', function () { worksResize(); worksAutoplay(); });
  }
  if (worksPrev) worksPrev.addEventListener('click', function () { moveWorks(-1); });
  if (worksNext) worksNext.addEventListener('click', function () { moveWorks(1); });
  if (worksPagination) worksPagination.addEventListener('click', function (e) {
    var dot = e.target.closest('[data-page]');
    if (!dot || !worksTrack) return;
    var step = worksStep(); if (!step) return;
    worksSettle(); // стоим на настоящей карточке — дальше считаем кратчайший путь по кругу
    var i = WL.idx, j = Math.max(0, Math.min(WL.n - 1, Number(dot.dataset.page) || 0)), d = j - i;
    if (WL.k) {
      if (d > WL.n / 2) d -= WL.n; else if (d < -WL.n / 2) d += WL.n;
      if (i + d < 1 - WL.k || i + d > WL.k + WL.n - 1 - WL.v) d = j - i;
    }
    worksGo(i + d + WL.k, step);
  });
  if (worksTrack) {
    /* клик по кадру — крупное фото; по соседнему кадру в поле — шаг в его сторону */
    worksTrack.addEventListener('click', function (e) {
      var w = e.target.closest('.work'); if (!w || e.target.closest('a')) return;
      if (WL.k) {
        var r = w.getBoundingClientRect(), t = worksTrack.getBoundingClientRect(), c = (r.left + r.right) / 2;
        if (c < t.left + worksPad('Left')) return moveWorks(-1);
        if (c > t.right - worksPad('Right')) return moveWorks(1);
      }
      openWork(w);
    });
    worksTrack.addEventListener('scroll', function () { refreshWorksCarousel(); worksSettleLater(); }, { passive: true });
    if ('onscrollend' in window) worksTrack.addEventListener('scrollend', function () { if (!WL.touch) worksSettle(); });
    worksTrack.addEventListener('touchstart', function () { WL.touch = true; }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function (ev) {
      worksTrack.addEventListener(ev, function () { WL.touch = false; worksSettleLater(); }, { passive: true });
    });
    worksTrack.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); moveWorks(e.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    addEventListener('resize', worksResize, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(worksResize).observe(worksTrack);
    setupWorks(0);
  }
  if (lbx) lbx.addEventListener('click', function () { lbx.classList.remove('on'); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && lbx) lbx.classList.remove('on'); });

  /* ---------- визуализация установки: см. js/story.js ---------- */

  /* ---------- данные: каталог и калькулятор (из админки, иначе — по умолчанию) ---------- */
  var CAT = window.PAMYAT_CATALOG_DEFAULT || { categories: [], items: [] };
  /* запасной калькулятор (пока не пришли данные из админки) — js/calc-default.js */
  var CALC_DEF = window.PAMYAT_CALC_DEFAULT || {};
  var CALC = CALC_DEF.steps || [];
  var CALC_DIMENSIONS = normalizeDimensionsConfig(CALC_DEF.dimensions);
  /* порядок шагов и тексты калькулятора (js/calc-flow.js; правятся в админке) */
  var CF = window.PamyatCalcFlow || null;
  var CALC_UI = CF ? CF.normalizeUi(null) : { monument: { enabled: true, name: 'Памятник', indButton: 'Заказать звонок' }, dimensions: {},
    contact: { name: 'Контакты', title: 'Куда прислать расчёт?', button: 'Отправить заявку', comment: true }, summary: { title: 'Ваш комплекс', total: 'Итого' }, order: [] };

  var DIMS = { length: '', width: '' };
  var Q = new URLSearchParams(location.search);
  var STEPS = [], S = {}, step = 0, MODEL = Q.get('model') || '', MODEL_CAT = Q.get('cat') || '';
  function visibleCats() { return (CAT.categories || []).filter(function (c) { return c.visible !== false; }); }
  function catOf(code) { var it = (CAT.items || []).filter(function (x) { return x.code === code; })[0]; return it ? it.cat : ''; }
  function normalizeDimensionsConfig(raw) {
    raw = raw || {};
    var min = Number(raw.min), max = Number(raw.max), stepSize = Number(raw.step);
    return {
      enabled: raw.enabled !== false,
      name: String(raw.name || 'Размеры'),
      sub: String(raw.sub || 'Укажите длину и ширину участка. Это необязательно — без размеров расчёт останется по базовым ценам.'),
      unit: String(raw.unit || 'м'),
      min: Number.isFinite(min) && min > 0 ? min : 0.1,
      max: Number.isFinite(max) && max > 0 ? max : 100,
      step: Number.isFinite(stepSize) && stepSize > 0 ? stepSize : 0.1,
      allowSkip: raw.allowSkip !== false,
      presets: (Array.isArray(raw.presets) ? raw.presets : []).map(function (p) {
        return Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p && p.length), Number(p && p.width)];
      }).filter(function (p) { return p[0] > 0 && p[1] > 0 && p[0] <= 100 && p[1] <= 100; }).slice(0, 12)
    };
  }
  var PP = window.PamyatPricing || null;
  var CALC_BASE = PP ? PP.normalizeBase(null) : { length: 2, width: 1.8, round: 1 };
  function pricingConfig(it) { return PP.normalizePricing(it); }
  function parseMeasure(value) {
    if (value == null || String(value).trim() === '') return NaN;
    return Number(String(value).trim().replace(',', '.'));
  }
  function getDimensions() {
    var length = parseMeasure(DIMS.length), width = parseMeasure(DIMS.width), cfg = CALC_DIMENSIONS;
    var valid = Number.isFinite(length) && Number.isFinite(width) &&
      length >= cfg.min && width >= cfg.min && length <= cfg.max && width <= cfg.max;
    if (!valid) return { provided: false, length: null, width: null, area: null, perimeter: null };
    return {
      provided: true,
      length: length,
      width: width,
      area: length * width,
      perimeter: 2 * (length + width)
    };
  }
  function roundMoney(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function calcItemPrice(it, d) {
    return PP.calcItem(it, d || getDimensions(), { base: CALC_BASE });
  }
  function fmt(n) { return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }); }
  function money(n) { return fmt(roundMoney(n)) + ' BYN'; }
  function unitName(it) {
    var p = pricingConfig(it);
    if (p.mode === 'curve') return 'BYN';
    if (p.mode === 'area' || p.quantity === 'area') return 'м²';
    if (p.mode === 'linear') return 'м.п.';
    return 'BYN';
  }
  function item(s, id) { return (s.items || []).filter(function (x) { return x.id === id; })[0]; }
  function rateOf(it) { return PP && PP.linearRate ? PP.linearRate(it) : null; }
  function priceLabel(it, catalogStep) {
    if (it.price == null) return 'инд. расчёт';
    if (it.note && Number(it.price) === 0) return it.note;
    var p = pricingConfig(it), d = getDimensions(), out = calcItemPrice(it, d), lr = rateOf(it);
    if (p.mode === 'curve') {
      if (d.provided) return money(out.amount);
      return lr ? fmt(lr.rate) + ' BYN/' + lr.unit : 'от ' + fmt(out.amount) + ' BYN';
    }
    if (p.mode !== 'fixed') {
      if (d.provided) return money(out.amount);
      return 'от ' + fmt(it.price) + ' BYN/' + unitName(it);
    }
    if (Number(it.price) === 0) return '0 BYN';
    return (catalogStep ? 'от ' : '') + fmt(it.price) + ' BYN';
  }
  /* строка под названием: что входит + как посчитано (площадь × ставка) */
  function itemNote(it) {
    var parts = [], lr = rateOf(it);
    if (lr && it.price != null) {
      var d = getDimensions();
      parts.push(d.provided ? fmt(PP.roundMoney(PP.measureValue(lr.quantity, d))) + ' ' + lr.unit + ' × ' + fmt(lr.rate) + ' BYN/' + lr.unit
        : 'Цена за 1 ' + lr.unit + '. Укажите размеры участка — посчитаем точно.');
    }
    if (it.note && !(Number(it.price) === 0)) parts.push(it.note);
    return parts.join(' · ');
  }
  function individual() { return STEPS.some(function (s) { return s.type === 'radio' && item(s, S[s.id]) && item(s, S[s.id]).price == null; }); }
  function selectedIds(s) { return s.type === 'multi' ? (S[s.id] || []) : (S[s.id] ? [S[s.id]] : []); }
  function selectedBreakdown() {
    var result = [];
    STEPS.forEach(function (s) {
      if (s.type === 'contact' || s.type === 'dimensions') return;
      selectedIds(s).forEach(function (id) {
        var it = item(s, id); if (!it) return;
        var dd = getDimensions(), p = calcItemPrice(it, dd), lr = rateOf(it);
        var full = lr ? PP.roundMoney(PP.measureValue(lr.quantity, dd.provided ? dd : PP.dimsOf(CALC_BASE.length, CALC_BASE.width))) : null;
        result.push({
          stepId: s.id, itemId: id, step: s.name, name: it.name,
          price: p.amount, quantity: p.quantity, unit: p.unit, basePrice: p.base,
          coefficient: p.coefficient, mode: p.mode,
          mainAmount: p.mainAmount, trimAmount: p.trimAmount, note: p.note || '',
          rate: (lr || {}).rate || null, full: full
        });
      });
    });
    return result;
  }
  function total() {
    return roundMoney(selectedBreakdown().reduce(function (sum, row) {
      return row.price == null ? sum : sum + Number(row.price || 0);
    }, 0));
  }
  function summary() {
    var d = getDimensions();
    var lines = [];
    if (d.provided) {
      lines.push('Размеры участка: ' + fmt(d.length) + ' × ' + fmt(d.width) + ' ' + CALC_DIMENSIONS.unit +
        '; площадь: ' + fmt(d.area) + ' м²; периметр: ' + fmt(d.perimeter) + ' м');
    } else lines.push('Размеры участка: не указаны — использованы базовые цены');
    selectedBreakdown().forEach(function (row) {
      var line = row.step + ': ' + row.name + ' — ' + (row.price == null ? 'индивидуальный расчёт' : money(row.price));
      if (row.mode === 'curve' && row.rate) {
        line += ' (' + fmt(row.full) + ' ' + row.unit + ' × ' + fmt(row.rate) + ' BYN/' + row.unit + (d.provided ? '' : ', базовый участок') + ')';
      } else if (row.mode === 'curve') {
        if (row.trimAmount > 0) line += ' (в т.ч. подрезка плитки ' + money(row.trimAmount) + ')';
        if (row.note) line += ' [' + row.note + ']';
      } else if (row.mode !== 'fixed' && d.provided) {
        line += ' (' + fmt(row.quantity) + ' ' + row.unit + ' × ' + fmt(row.basePrice) + ' × коэффициент ' + fmt(row.coefficient) + ')';
      }
      lines.push(line);
    });
    if (MODEL) lines.push('Модель: ' + MODEL);
    return lines.join('\n');
  }
  var lastTotal = '';
  function drawTotal() {
    var tv = $('#tv'); if (!tv) return;
    var any = selectedBreakdown().length > 0;
    var txt = individual() ? CALC_UI.summary.individual : any ? (getDimensions().provided ? fmt(total()) + ' BYN' : 'от ' + fmt(total()) + ' BYN') : '0 BYN';
    if ($('#mtv')) $('#mtv').textContent = txt;
    if (txt !== lastTotal) { tv.textContent = txt; tv.classList.remove('bump'); void tv.offsetWidth; tv.classList.add('bump'); lastTotal = txt; }
  }
  function renderSummary() {
    var box = $('#sum'); if (!box) return;
    var d = getDimensions(), html = '';
    if (d.provided) {
      html += '<li><span class="lb">Размеры участка</span><div class="rw"><span>' +
        fmt(d.length) + ' × ' + fmt(d.width) + ' ' + CALC_DIMENSIONS.unit + '</span><i>' +
        fmt(d.area) + ' м² · периметр ' + fmt(d.perimeter) + ' м</i></div></li>';
    } else if (CALC_DIMENSIONS.enabled) {
      html += '<li><span class="lb">Размеры участка</span><div class="rw no"><span>не указаны</span><i>базовый расчёт</i></div></li>';
    }
    var breakdown = selectedBreakdown(), byStep = {};
    breakdown.forEach(function (row) {
      if (!byStep[row.stepId]) byStep[row.stepId] = [];
      byStep[row.stepId].push(row);
    });
    STEPS.forEach(function (s, i) {
      if (s.type === 'contact' || s.type === 'dimensions' || (individual() && i > 0)) return;
      var rows = byStep[s.id] || [];
      var rws = rows.length ? rows.map(function (row) {
        var note = row.mode === 'curve' && row.rate
          ? fmt(row.full) + ' ' + row.unit + ' × ' + fmt(row.rate) + ' BYN/' + row.unit + (d.provided ? '' : ' · базовый участок ' + fmt(CALC_BASE.length) + ' × ' + fmt(CALC_BASE.width) + ' м')
          : row.mode === 'curve'
          ? [row.trimAmount > 0 ? 'в т.ч. подрезка плитки ' + money(row.trimAmount) : '', row.note].filter(Boolean).join(' · ')
          : row.mode !== 'fixed'
          ? (d.provided
            ? fmt(row.quantity) + ' ' + row.unit + ' × ' + fmt(row.basePrice) + ' BYN' + (row.coefficient !== 1 ? ' · коэффициент ' + fmt(row.coefficient) : '')
            : 'Размеры не указаны — базовая ставка за единицу')
          : '';
        var amount = row.price == null ? 'инд.' : (row.mode === 'curve' && !d.provided
          ? 'от ' + money(row.price)
          : row.mode !== 'fixed' && row.mode !== 'curve' && !d.provided
          ? 'от ' + fmt(row.price) + ' BYN/' + row.unit
          : money(row.price));
        return '<div class="rw"><span>' + escHtml(row.name) + '</span><i>' + amount + '</i></div>' +
          (note ? '<div class="rw-note">' + note + '</div>' : '');
      }).join('') : '<div class="rw no"><span>' + escHtml(CALC_UI.summary.empty) + '</span></div>';
      html += '<li><span class="lb">' + escHtml(s.name) + '</span>' + rws + '</li>';
    });
    box.innerHTML = html;
    drawTotal();
  }
  function fmt1(n) { return Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 }); }
  function presetsHtml() {
    var ps = CALC_DIMENSIONS.presets || [];
    if (!ps.length) return '';
    return '<div class="dim-presets" role="group" aria-label="Типовые размеры участка"><span class="dim-presets-t">' + escHtml(CALC_UI.dimensions.presetsTitle) + '</span><div class="dim-presets-l">' +
      ps.map(function (p) {
        return '<button type="button" class="dim-preset" data-l="' + p[0] + '" data-w="' + p[1] + '" aria-pressed="false">' +
          '<b>' + fmt1(p[0]) + ' × ' + fmt1(p[1]) + '</b><i>' + fmt(PP ? PP.roundMoney(p[0] * p[1]) : p[0] * p[1]) + ' м²</i></button>';
      }).join('') + '</div></div>';
  }
  function markPreset() {
    var d = getDimensions();
    $$('.dim-preset').forEach(function (b) {
      var on = d.provided && Math.abs(+b.dataset.l - d.length) < 1e-6 && Math.abs(+b.dataset.w - d.width) < 1e-6;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function refreshDimensionsPreview() {
    var d = getDimensions(), area = $('#dimArea'), perimeter = $('#dimPerimeter'), error = $('#dimError');
    markPreset();
    if (area) area.textContent = d.provided ? fmt(d.area) + ' м²' : '—';
    if (perimeter) perimeter.textContent = d.provided ? fmt(d.perimeter) + ' м' : '—';
    if (error) {
      var hasLength = String(DIMS.length || '').trim() !== '', hasWidth = String(DIMS.width || '').trim() !== '';
      error.textContent = hasLength && hasWidth && !d.provided
        ? 'Проверьте размеры: допустимый диапазон ' + fmt(CALC_DIMENSIONS.min) + '–' + fmt(CALC_DIMENSIONS.max) + ' ' + CALC_DIMENSIONS.unit + '.'
        : '';
    }
    renderSummary();
  }
  function go(n) {
    step = Math.max(0, Math.min(STEPS.length - 1, n)); render();
    if (innerWidth <= 720) { var p = $('#calc .panel'); if (p) smoothPageScroll(p.getBoundingClientRect().top + scrollY - 76, { duration: 0.64 }); }
  }
  function render() {
    if (!$('#q') || !STEPS.length) return;
    var s = STEPS[step];
    $('#snav').innerHTML = STEPS.map(function (x, i) {
      return '<button type="button" data-step="' + i + '" class="' + (i === step ? 'on' : i < step ? 'done' : '') + '">' + (i + 1) + '. ' + escHtml(x.name) + '</button>';
    }).join('');
    $$('#snav button').forEach(function (b) { b.addEventListener('click', function () { go(+b.dataset.step); }); });
    var on = $('#snav .on'); if (on) $('#snav').scrollLeft = Math.max(0, on.offsetLeft - 16);
    if (s.type === 'contact') {
      var ind = individual(), K = CALC_UI.contact;
      $('#q').innerHTML = '<div class="qtitle">' + escHtml(ind ? K.titleInd : K.title) + '</div><div class="qsub">' + escHtml(ind ? K.subInd : K.sub) + '</div>' +
        '<form class="form qcontact" id="cform"><input required name="name" placeholder="Имя" autocomplete="name"><input required name="phone" type="tel" placeholder="+375 (XX) XXX-XX-XX" autocomplete="tel">' +
        (K.comment ? '<textarea name="c" rows="2" placeholder="' + escHtml(K.commentPh) + '"></textarea>' : '') +
        '<div class="row2"><button class="btn btn-gold" type="submit">' + escHtml(ind ? K.buttonInd : K.button) + ' <span class="arr">→</span></button><button class="btn btn-line" type="button" id="qback">← Назад</button></div>' +
        (K.consent ? '<p class="muted">' + escHtml(K.consent) + '</p>' : '') + '</form><div class="ok" id="cok">' + escHtml(K.ok) + '</div>';
      bindForm('#cform', '#cok', 'calc');
      $('#qback').onclick = function () { go(individual() ? 0 : step - 1); };
    } else if (s.type === 'dimensions') {
      var d = getDimensions(), unit = CALC_DIMENSIONS.unit;
      $('#q').innerHTML = '<div class="qtitle">' + escHtml(CALC_DIMENSIONS.name) + (CALC_DIMENSIONS.allowSkip ? ' <span class="q-optional">(необязательно)</span>' : '') + '</div>' +
        '<div class="qsub">' + escHtml(CALC_DIMENSIONS.sub) + '</div>' +
        '<div class="dimensions-card">' +
          presetsHtml() +
          '<div class="dimensions-fields">' +
            '<label>Длина (' + escHtml(unit) + ')<input id="dimLength" type="number" min="' + CALC_DIMENSIONS.min + '" max="' + CALC_DIMENSIONS.max + '" step="' + CALC_DIMENSIONS.step + '" inputmode="decimal" autocomplete="off" placeholder="Например, 2.2" value="' + escHtml(DIMS.length) + '"></label>' +
            '<span class="dimensions-multiply">×</span>' +
            '<label>Ширина (' + escHtml(unit) + ')<input id="dimWidth" type="number" min="' + CALC_DIMENSIONS.min + '" max="' + CALC_DIMENSIONS.max + '" step="' + CALC_DIMENSIONS.step + '" inputmode="decimal" autocomplete="off" placeholder="Например, 1.4" value="' + escHtml(DIMS.width) + '"></label>' +
          '</div>' +
          '<div class="dimensions-result">' +
            '<div><span>Площадь участка</span><b id="dimArea">' + (d.provided ? fmt(d.area) + ' м²' : '—') + '</b></div>' +
            '<div><span>Периметр</span><b id="dimPerimeter">' + (d.provided ? fmt(d.perimeter) + ' м' : '—') + '</b></div>' +
          '</div>' +
          '<p class="dimensions-error" id="dimError"></p>' +
          '<p class="dimensions-hint">' + escHtml(CALC_DIMENSIONS.allowSkip ? CALC_UI.dimensions.hint : CALC_UI.dimensions.hintRequired) + '</p>' +
          (CALC_DIMENSIONS.allowSkip ? '<button type="button" class="dimensions-skip" id="dimSkip">' + escHtml(CALC_UI.dimensions.skip) + '</button>' : '') +
        '</div>';
      ['dimLength','dimWidth'].forEach(function (id) {
        var input = $('#' + id);
        if (!input) return;
        input.addEventListener('input', function () {
          DIMS[id === 'dimLength' ? 'length' : 'width'] = input.value;
          refreshDimensionsPreview();
        });
      });
      markPreset();
      $$('.dim-preset', $('#q')).forEach(function (b) {
        b.addEventListener('click', function () {
          DIMS.length = b.dataset.l; DIMS.width = b.dataset.w;
          if ($('#dimLength')) $('#dimLength').value = DIMS.length;
          if ($('#dimWidth')) $('#dimWidth').value = DIMS.width;
          refreshDimensionsPreview();
        });
      });
      if ($('#dimSkip')) $('#dimSkip').onclick = function () { DIMS.length = ''; DIMS.width = ''; go(step + 1); };
    } else {
      var M = CALC_UI.monument;
      var pick = s.catalog && S.monument && S.monument !== 'individual'
        ? '<a class="pick" href="/catalog#' + encodeURIComponent(S.monument) + '">' + escHtml(MODEL ? 'Модель ' + MODEL + ' · ' + M.pickOther : M.pick) + ' →</a>' : '';
      $('#q').innerHTML = '<div class="qtitle">' + escHtml(s.name) + '</div><div class="qsub">' + escHtml(s.sub || '') + '</div>' + s.items.map(function (o) {
        var on = s.type === 'multi' ? S[s.id].indexOf(o.id) > -1 : S[s.id] === o.id;
        var nt = itemNote(o), tt = '<span class="t">' + escHtml(o.name) + (nt ? '<small class="opt-note">' + escHtml(nt) + '</small>' : '') + '</span>';
        return s.type === 'multi'
          ? '<div class="tog' + (on ? ' on' : '') + '" data-id="' + o.id + '" role="switch" aria-checked="' + on + '" tabindex="0"><span class="sw"></span>' + tt + '<span class="p">' + priceLabel(o, s.catalog) + '</span></div>'
          : '<div class="radio' + (on ? ' on' : '') + '" data-id="' + o.id + '" role="radio" aria-checked="' + on + '" tabindex="0"><i></i>' + tt + '<span class="p">' + priceLabel(o, s.catalog) + '</span></div>';
      }).join('') + pick + (s.catalog && individual() && M.ind
        ? '<div class="indcall"><p>' + escHtml(M.ind) + '</p></div>' : '');
      $$('[data-id]', $('#q')).forEach(function (el) {
        var act = function () {
          var id = el.dataset.id;
          if (s.type === 'multi') { var a = S[s.id], j = a.indexOf(id); j > -1 ? a.splice(j, 1) : a.push(id); }
          else { if (s.catalog && S[s.id] !== id) MODEL = ''; S[s.id] = S[s.id] === id ? '' : id; }
          render();
        };
        el.addEventListener('click', act); el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      });
    }
    var navbar = $('#prev').parentNode;
    navbar.style.display = s.type === 'contact' ? 'none' : '';
    $('#prev').style.display = step ? '' : 'none';
    $('#next').innerHTML = escHtml(s.catalog && individual() ? CALC_UI.monument.indButton : 'Далее') + ' <span class="arr">→</span>';
    if ($('#mnext')) { $('#mnext').innerHTML = $('#next').innerHTML; $('#mnext').style.display = s.type === 'contact' ? 'none' : ''; }
    renderSummary();
  }
  function build() {
    // Памятник из каталога, необязательные размеры и шаги из админки — в порядке из админки; «Контакты» всегда последним.
    var M = CALC_UI.monument;
    var first = { id: 'monument', name: M.name, type: 'radio', sub: M.sub, catalog: true,
      items: visibleCats().filter(function (c) { return c.calc !== false; }).map(function (c) { return { id: c.id, name: c.short || c.name, price: c.price == null ? null : +c.price, pricing: { mode: 'fixed' } }; }) };
    var dimsStep = { id: '__dimensions', name: CALC_DIMENSIONS.name || 'Размеры', type: 'dimensions' };
    var custom = CALC.filter(function (s) { return s.id !== 'monument' && s.items && s.items.length; }), byId = {};
    custom.forEach(function (s) { byId[s.id] = s; });
    var ids = custom.map(function (s) { return s.id; }), useMon = M.enabled !== false, useDims = CALC_DIMENSIONS.enabled !== false;
    var keys = CF ? CF.sequence(ids, { order: CALC_UI.order, monument: useMon, dimensions: useDims })
      : (useMon ? ['@monument'] : []).concat(useDims ? ['@dimensions'] : [], ids);
    STEPS = keys.map(function (k) { return k === '@monument' ? first : k === '@dimensions' ? dimsStep : byId[k]; }).filter(Boolean)
      .concat([{ id: '__contact', name: CALC_UI.contact.name || 'Контакты', type: 'contact' }]);
    var old = S; S = {};
    STEPS.forEach(function (s) {
      if (s.type === 'contact' || s.type === 'dimensions') return;
      var keep = old[s.id], ok = s.type === 'multi' ? (keep || []).filter(function (id) { return item(s, id); }) : (item(s, keep) ? keep : '');
      S[s.id] = ok;
    });
    var mc = MODEL_CAT || (MODEL && catOf(MODEL));
    if (useMon && mc && item(first, mc)) S.monument = mc;
    if (step >= STEPS.length) step = 0;
    calcChrome();
  }
  /* подписи панели «Ваш комплекс» и нижней полосы на телефоне */
  function calcChrome() {
    var U = CALC_UI.summary, box = $('#calc .summary');
    if (box) {
      var h = $('h3', box), lb = $('.live span', box), note = $(':scope > .muted', box);
      if (h) h.textContent = U.title; if (lb) lb.textContent = U.total;
      if (note) { note.textContent = U.note; note.hidden = !U.note; }
    }
    var ml = $('#mbar .mt span'); if (ml) ml.textContent = U.total;
  }
  function escHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  if ($('#q')) {
    $('#prev').onclick = function () { if (step > 0) go(step - 1); };
    var nextStep = function () {
      var current = STEPS[step];
      if (current && current.type === 'dimensions' && !CALC_DIMENSIONS.allowSkip && !getDimensions().provided) {
        var error = $('#dimError');
        if (error) error.textContent = 'Укажите корректные длину и ширину участка, чтобы продолжить.';
        return;
      }
      go(current.catalog && individual() ? STEPS.length - 1 : step + 1);
    };
    $('#next').onclick = nextStep;
    if ($('#mnext')) $('#mnext').onclick = nextStep;
    // нижняя панель с ценой на телефоне — видна, пока на экране калькулятор
    if ($('#mbar')) document.body.appendChild($('#mbar'));
    if ('IntersectionObserver' in window && $('#mbar')) new IntersectionObserver(function (es) {
      es.forEach(function (e) { $('#mbar').classList.toggle('on', e.isIntersecting); });
    }, { rootMargin: '-30% 0px -30% 0px' }).observe($('#calc .calc'));
  }
  window.pamyatPickModel = function (code, cat) {
    MODEL = code; MODEL_CAT = cat || catOf(code) || MODEL_CAT; build(); step = 0; render();
    var c = $('#calc'); if (c) smoothPageScroll(c, { offset: -12, duration: 0.72 });
  };

  /* ---------- каталог на главной: крупно один элемент на раздел ---------- */
  function coverHtml(c) {
    var cv = c.cover || {};
    if (!cv.img) return '<div class="cover ind">✦<span>По вашему эскизу</span></div>';
    var z = Math.max(0.8, Math.min(2.2, +cv.zoom || 1)), sm = catSized(cv.img, 'sm'), md = catSized(cv.img, 'md');
    var set = sm !== md ? ' srcset="' + workHtmlEscape(sm) + ' 640w, ' + workHtmlEscape(md) + ' 1600w" sizes="(max-width: 720px) ' + Math.round(88 * z) + 'vw, ' + Math.round(340 * z) + 'px" data-full="' + workHtmlEscape(cv.img) + '" onerror="catFallback(this)"' : '';
    return '<div class="cover"><img src="' + workHtmlEscape(sm) + '"' + set + ' alt="' + workHtmlEscape(c.name) + '" loading="lazy" decoding="async" style="--z:' + (cv.zoom || 1) + ';--pos:' + (cv.pos || '50% 50%') + '"></div>';
  }
  /* фото каталога: sm 640 / md 1600 (assets/catalog/sm|md), оригинал 4K — только в карточке */
  function catSized(u, size) {
    var m = /^\/assets\/catalog\/([A-Za-z0-9_.-]+\.webp)(?:[?#].*)?$/.exec(u || '');
    if (m) return '/assets/catalog/' + size + '/' + m[1] + (/^[KO]\d+\.webp$/.test(m[1]) ? '?v=x4' : ''); // x4plus: новый адрес
    if (/^\/api\/img\?/.test(u || '') && !/[?&]w=/.test(u)) return u + '&w=' + (size === 'sm' ? 640 : 1600);
    return u || '';
  }
  window.catFallback = function (im) {
    var f = im.getAttribute('data-full'); if (!f || im.getAttribute('src') === f) return;
    im.removeAttribute('srcset'); im.removeAttribute('sizes'); im.removeAttribute('data-full'); im.src = f;
  };
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }
  function drawTeaser() {
    var box = $('#catTeaser'); if (!box) return;
    box.innerHTML = visibleCats().map(function (c) {
      var n = (CAT.items || []).filter(function (x) { return x.cat === c.id; }).length;
      return '<a class="cc glass rv in" href="/catalog#' + c.id + '">' + coverHtml(c) + '<h3>' + c.name + '</h3>' +
        '<div class="pr">' + (c.price == null ? 'Индивидуальный расчёт' : 'от ' + fmt(c.price) + ' BYN') + '</div>' +
        '<p class="inc">' + (c.inc ? 'Входит: ' + c.inc : (c.desc || '')) + '</p>' +
        '<div class="go"><span>' + (n ? n + ' ' + (c.calc === false || c.id === 'accessories' ? plural(n, 'изделие', 'изделия', 'изделий') : plural(n, 'модель', 'модели', 'моделей')) : 'Обсудить проект') + '</span><b>Открыть →</b></div></a>';
    }).join('');
  }

  function socialUrl(k, v) {
    if (!v) return '';
    if (k === 'telegram') return /^https?:/.test(v) ? v : 'https://t.me/' + v.replace(/^@/, '');
    if (k === 'viber') return 'viber://chat?number=' + encodeURIComponent(v.replace(/[^\d+]/g, ''));
    if (k === 'whatsapp') return 'https://wa.me/' + v.replace(/\D/g, '');
    if (k === 'instagram') return /^https?:/.test(v) ? v : 'https://instagram.com/' + v.replace(/^@/, '');
    return v;
  }
  function workHtmlEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  function workCrop(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  }
  function workBadgeColor(value) {
    var color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '#9a7436';
  }
  function workZoom(value) {
    if (value == null || value === '') return 1;
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0.5, Math.min(2.2, n)) : 1;
  }
  /* Display-only captions for the four photos already in the database.
     Admin values always take precedence; these defaults don't write to Neon. */
  function workPresentationDefaults(work) {
    var byImage = {
      '/api/img?id=1': { caption:'Памятник черный гранитный', description:'Двойной памятник с полированной поверхностью' },
      '/api/img?id=2': { caption:'Памятник с портретом', description:'Элегантный памятник с художественной гравировкой' },
      '/api/img?id=3': { caption:'Ограда с покрытием', description:'Благоустроенный участок с гранитным настилом' },
      '/api/img?id=6': { caption:'Индивидуальный проект', description:'Подберём форму, камень и оформление под ваш участок' }
    };
    return byImage[String(work && work.img || '')] || { caption:'', description:'' };
  }

  /* фото работ отдаются уменьшенными (api/img и api/work-img умеют ?w=): ~1 МБ → ~100–200 КБ */
  function workSized(u, w) {
    u = String(u || '');
    if (/^\/api\/img\?id=\d+$/.test(u)) return u + '&w=' + w;
    if (/^https:\/\/[^/]*neon\.tech\//i.test(u)) return '/api/work-img?u=' + encodeURIComponent(u) + '&w=' + w;
    return '';
  }
  /* строка «камень | размер» под заголовком карточки (поля «Камень» и «Размер» в админке) */
  var WORK_ICON = {
    stone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6 3.2 8.1 12 12.6l8.8-4.5L12 3.6Z"/><path d="m3.2 12 8.8 4.5 8.8-4.5"/><path d="m3.2 15.9 8.8 4.5 8.8-4.5"/></svg>',
    size: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="6.4" width="17.6" height="11.2" rx="2.6"/><path d="M7.2 6.4v3.1M11 6.4v4.5M14.8 6.4v3.1M18.2 6.4v2"/></svg>'
  };
  function workMeta(w) {
    var stone = String(w.stone || '').trim(), size = String(w.size || '').trim();
    if (!stone && !size) return '';
    return '<div class="work-meta">' +
      (stone ? '<span class="wm">' + WORK_ICON.stone + workHtmlEscape(stone) + '</span>' : '') +
      (stone && size ? '<i class="wm-sep" aria-hidden="true"></i>' : '') +
      (size ? '<span class="wm">' + WORK_ICON.size + workHtmlEscape(size) + '</span>' : '') + '</div>';
  }
  function workImgAttrs(u) {
    var a = workSized(u, 720), b = workSized(u, 1200), c = workSized(u, 1800);
    if (!a) return 'src="' + workHtmlEscape(u) + '"';
    return 'src="' + workHtmlEscape(b) + '" srcset="' + workHtmlEscape(a) + ' 720w, ' + workHtmlEscape(b) + ' 1200w, ' + workHtmlEscape(c) + ' 1800w" ' +
      'sizes="(max-width: 720px) 88vw, (max-width: 1100px) 46vw, 31vw" data-orig="' + workHtmlEscape(u) + '"';
  }
  function applyContent(c) {
    if (!c) return;
    if (LOOK) LOOK.apply(c.look);
    var T = c.texts || {};
    $$('[data-t]').forEach(function (el) { var v = T[el.dataset.t]; if (v) el.textContent = v; });
    var C = c.contacts || {};
    var tel = (C.phone || '').replace(/[^\d+]/g, '');
    if ($('#cPhone') && C.phone) { $('#cPhone').textContent = C.phone; $('#cPhone').href = tel.replace(/\D/g, '').length >= 7 ? 'tel:' + tel : '#contact'; }
    if ($('#faqCall')) { var okTel = tel.replace(/\D/g, '').length >= 7; $('#faqCall').href = okTel ? 'tel:' + tel : '#contact'; $('#faqCall').hidden = !okTel && !!c.__live; }
    [['#cTg', 'telegram'], ['#cViber', 'viber'], ['#cWa', 'whatsapp'], ['#cIg', 'instagram']].forEach(function (p) {
      var a = $(p[0]), url = socialUrl(p[1], C[p[1]]); if (!a) return;
      if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.hidden = false; } else a.hidden = !!c.__live;
    });
    $$('.soc[data-soc]').forEach(function (a) {
      var url = socialUrl(a.dataset.soc, C[a.dataset.soc]);
      if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.hidden = false; } else a.hidden = !!c.__live;
    });
    if ($('#cLegal') && (C.company || C.unp)) $('#cLegal').textContent = [C.company, C.unp ? 'УНП ' + C.unp : ''].filter(Boolean).join(' · ');
    if (Array.isArray(c.works) && $('#worksGrid')) {
      $('#worksGrid').innerHTML = c.works.map(function (w) {
        w = w || {};
        var defaults = workPresentationDefaults(w);
        var caption = String(w.caption || '').trim() || (w.presentationEdited ? '' : defaults.caption);
        var description = String(w.description || '').trim() || (w.presentationEdited ? '' : defaults.description);
        var badge = String(w.badgeText || '').trim();
        var color = workBadgeColor(w.badgeColor);
        var cropX = workCrop(w.cropX), cropY = workCrop(w.cropY), zoom = workZoom(w.zoom);
        var meta = workMeta(w), info = !!(caption || description || meta);
        return '<figure class="work glass rv in' + (info ? ' has-info' : '') + '" style="--crop-x:' + cropX + '%;--crop-y:' + cropY + '%;--photo-zoom:' + zoom + '">' +
          '<div class="mat">' +
            '<img class="work-photo-main" ' + workImgAttrs(w.img || '') + ' loading="lazy" decoding="async" alt="' + workHtmlEscape(caption || 'Пример работы') + '">' +
            (badge ? '<span class="work-badge" style="--badge-color:' + color + '"><i aria-hidden="true"></i>' + workHtmlEscape(badge) + '</span>' : '') +
            '<div class="work-info">' +
              '<div class="work-copy">' +
                (caption ? '<h3>' + workHtmlEscape(caption) + '</h3>' : '') +
                (meta || (description ? '<p>' + workHtmlEscape(description) + '</p>' : '')) +
              '</div>' +
            '</div>' +
          '</div></figure>';
      }).join('');
      setupWorks(0);
    }
    if (c.catalog && Array.isArray(c.catalog.categories)) { CAT = c.catalog; window.PAMYAT_CATALOG = CAT; document.dispatchEvent(new CustomEvent('pamyat:catalog', { detail: CAT })); }
    if (c.calc && Array.isArray(c.calc.steps)) {
      CALC = c.calc.steps; CALC_DIMENSIONS = normalizeDimensionsConfig(c.calc.dimensions); if (PP) CALC_BASE = PP.normalizeBase(c.calc.base);
      if (CF) CALC_UI = CF.normalizeUi(c.calc);
    }
    drawTeaser(); build(); render(); themes();
  }
  window.PAMYAT_CATALOG = CAT; window.pamyatThemes = themes;
  drawTeaser(); build(); render(); themes();
  if (!window.PAMYAT_DEMO) {
    fetch('/api/content', { headers: { accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) { d.content.__live = true; applyContent(d.content); } }).catch(function () { });
  }

  /* предпросмотр в админке: черновик содержимого и оформления без сохранения */
  if (PREVIEW) {
    window.pamyatPreview = {
      content: function (c) { if (c) { c = JSON.parse(JSON.stringify(c)); c.__live = true; applyContent(c); } },
      look: function (l) { if (LOOK) LOOK.apply(l); },
      dove: function () { if (window.pamyatDove) window.pamyatDove.fly(true); }
    };
    try { window.parent.postMessage({ t: 'pamyat-preview-ready' }, location.origin); } catch (e) { }
  }

  /* FAQ: «Задать вопрос» — к форме обратной связи и сразу в поле имени */
  $$('[data-ask]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var f = $('#lform'); if (!f) return;
      e.preventDefault();
      smoothPageScroll($('#contact'), { offset: -24, duration: 0.9 });
      setTimeout(function () { var n = f.querySelector('[name=name]'); if (n && f.offsetParent) try { n.focus({ preventScroll: true }); } catch (x) { n.focus(); } }, calm ? 60 : 950);
    });
  });

  /* ---------- FAQ ---------- */
  var QA = [
    ['Когда можно ставить памятник?', 'Обычно через год после захоронения, когда грунт осядет. Замер и проект можно сделать раньше, чтобы к нужному сроку всё было готово.'],
    ['Что входит в «под ключ»?', 'Изготовление, доставка, фундамент, установка, благоустройство и уборка участка. Всё прописываем в договоре.'],
    ['Работаете ли вы зимой?', 'Изготовление идёт круглый год. Бетонные работы делаем в тёплый сезон, памятник на готовое основание можно установить и зимой.'],
    ['Можно выбрать другой гранит?', 'Да. Памятник может быть изготовлен из любого гранита по вашему выбору — подберём под бюджет и участок.'],
    ['Какая гарантия?', '2 года — на фундамент и установку, 10 лет — на камень. Срок и условия указываем в договоре.']
  ];
  if ($('#qa')) {
    $('#qa').innerHTML = QA.map(function (x) { return '<div class="qa"><button type="button">' + x[0] + '<i></i></button><div class="a"><div><p>' + x[1] + '</p></div></div></div>'; }).join('');
    $$('.qa button').forEach(function (b) { b.addEventListener('click', function () { b.parentElement.classList.toggle('open'); }); });
  }

  /* ---------- формы → заявка (база + Telegram) ---------- */
  function bindForm(formSel, okSel, type) {
    var f = $(formSel); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(f), btn = f.querySelector('button[type=submit]');
      var lead = { type: type, name: fd.get('name'), phone: fd.get('phone'), comment: fd.get('c') || '', source: location.href };
      if (type === 'calc') { lead.price = individual() ? null : total(); lead.config = { summary: summary(), sel: S, model: MODEL, dimensions: getDimensions(), calculations: selectedBreakdown() }; }
      function done() { f.style.display = 'none'; $(okSel).classList.add('on'); }
      if (window.PAMYAT_DEMO) return done();
      btn.disabled = true; btn.textContent = 'Отправляем…';
      fetch('/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lead) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok && d.ok, d: d }; }); })
        .then(function (x) {
          if (x.ok) return done();
          btn.disabled = false; btn.textContent = 'Отправить ещё раз';
          alert((x.d && x.d.error) || 'Не удалось отправить. Позвоните нам, пожалуйста.');
        })
        .catch(function () { btn.disabled = false; btn.textContent = 'Отправить ещё раз'; alert('Нет связи. Позвоните нам, пожалуйста.'); });
    });
  }
  bindForm('#lform', '#lok', 'contact');
})();
