/* ПАМЯТЬ.БАЙ — лампада за кадром, внизу слева.
   Самой лампады не видно: виден только её живой свет — тёплое свечение от левого края у подвала,
   отсвет на «полу» и на линии подвала. Свет отражается на поверхностях (тёплая кромка со стороны огня
   у кнопок, карточек, полей, текста), а элементы отбрасывают лёгкие тени от огня — тени лежат на фоне
   и чуть «дышат» вместе с пламенем. Тени чёткие и ложатся вправо-вниз от элементов (ближняя + мягкая дальняя).
   Яркость, дальность, сила/чёткость теней и отражений — из админки («Оформление» → «Лампада», js/look.js).
   Анимации — только opacity/transform (WAAPI, общий такт). */
(function () {
  'use strict';
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var amb = document.querySelector('.ambience'); if (!amb) return;
  var glowEl = amb.querySelector('.flame-light'), breath = amb.querySelector('.light-breath');
  var GLOW = '.btn, .cta2, .msg, .back, .dimensions-skip, .glass, .panel, .radio, .tog, .dim-preset';
  var CAST = '.btn, .cta2, .msg, .back, .glass, .panel, .dim-preset';
  var INP = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea';
  var TXT = 'main h2, .phone, .lead, main .eyebrow, footer .wrap > span, footer .legal a';
  var DUR = 7800, T0 = null, anims = [], lit = [], timer = 0, L = null;
  var DX = .86, DY = .5; // направление теней: вправо-вниз
  function opts() {
    var d = { enabled: true, power: 130, reach: 140, shadow: 100, crisp: 70, reflect: 100 };
    try { var g = window.PamyatLook && PamyatLook.get().lamp; if (g) d = g; } catch (e) { }
    return d;
  }
  // живое пламя: медленное дыхание × быстрое неровное мерцание (3 такта за цикл) → 0..1, 1 — ярче
  var SLOW = [1, .8, .93, .7, .88, 1, .74, .9, .66, .86, 1, .76, .95, .7, .86, 1, .74, .9, .68, 1];
  var FAST = [1, .9, .97, .8, .94, 1, .86, .95, .76, .97, 1];
  function at(a, t) { var x = t * (a.length - 1), i = Math.floor(x), f = x - i; return i >= a.length - 1 ? a[a.length - 1] : a[i] + (a[i + 1] - a[i]) * f; }
  var FL = [], N = 72;
  for (var i = 0; i <= N; i++) { var t = i / N; FL.push(at(SLOW, t) * at(FAST, (t * 3) % 1 || (i ? 1 : 0))); }
  (function () { var lo = Math.min.apply(null, FL), hi = Math.max.apply(null, FL); FL = FL.map(function (v) { return (v - lo) / (hi - lo); }); })();
  function frames(lo, hi, extra) {
    return FL.map(function (v, i) {
      var f = { opacity: +(lo + (hi - lo) * v).toFixed(3), offset: i / (FL.length - 1), easing: 'ease-in-out' };
      if (extra) Object.assign(f, extra(v, i));
      return f;
    });
  }
  function play(el, kf, opt) {
    if (calm || !el || !el.animate) return null;
    try {
      var a = el.animate(kf, Object.assign({ duration: DUR, iterations: Infinity }, opt || {}));
      if (document.timeline && document.timeline.currentTime != null) {
        if (T0 == null) T0 = document.timeline.currentTime;
        a.startTime = T0; // всё мерцает в такт одному пламени
      }
      anims.push(a);
      return a;
    } catch (e) { return null; }
  }
  function sway(i) { return Math.sin(i / N * Math.PI * 2 * 3) * .6 + Math.sin(i / N * Math.PI * 2 * 7 + 1.3) * .4; } // покачивание пламени −1..1

  /* ---------- свет от невидимой лампады ---------- */
  var src = document.createElement('div'); src.className = 'lamp-src'; src.setAttribute('aria-hidden', 'true');
  src.innerHTML = '<i class="ls-floor"></i><i class="ls-core"></i><i class="ls-line"></i>';
  var shades = document.createElement('div'); shades.className = 'lamp-shades'; shades.setAttribute('aria-hidden', 'true');
  amb.appendChild(shades); amb.appendChild(src); amb.classList.add('has-lamp');
  play(src.querySelector('.ls-core'), frames(.3, 1, function (v, i) { return { transform: 'translate3d(' + (sway(i) * 5).toFixed(1) + 'px,' + ((1 - v) * 4).toFixed(1) + 'px,0) scale(' + (.92 + v * .1).toFixed(3) + ')' }; }));
  play(src.querySelector('.ls-floor'), frames(.45, 1, function (v) { return { transform: 'scaleX(' + (.94 + v * .08).toFixed(3) + ')' }; }));
  play(src.querySelector('.ls-line'), frames(.35, 1));
  play(glowEl, frames(.6, 1, function (v) { return { transform: 'scale(' + (.96 + v * .05).toFixed(3) + ')' }; }));
  play(breath, frames(.5, 1, function (v) { return { transform: 'scale(' + (.95 + v * .07).toFixed(3) + ')' }; }));
  if (window.KeyframeEffect && 'pseudoElement' in KeyframeEffect.prototype) play(amb, frames(.76, 1), { pseudoElement: '::after' });
  // тени: огонь тускнеет — тени бледнеют; пламя качается — тени чуть смещаются
  play(shades, frames(.7, 1, function (v, i) { return { transform: 'translate3d(' + (sway(i) * -1.6).toFixed(2) + 'px,' + (sway(i) * .8).toFixed(2) + 'px,0) scale(' + (1 + (1 - v) * .004).toFixed(4) + ')' }; }));

  function px(v) { return Math.round(v) + 'px'; }
  // положение по раскладке (без transform: появление .rv и подъём кнопок при наведении не сдвигают тени)
  function box(el) {
    var x = 0, y = 0, e = el;
    while (e) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x0: x, y0: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function place() {
    var foot = document.querySelector('body > footer') || document.querySelector('footer');
    if (!amb.offsetHeight) return null;
    var A = box(amb), AH = amb.offsetHeight, W = document.documentElement.clientWidth;
    var ft = foot ? box(foot).y0 - A.y0 : AH - 60;
    // огонь — за левым краем, чуть ниже линии подвала
    var fx = -Math.max(40, Math.min(90, W * .05)), fy = ft + 14;
    // всё привязано к низу страницы: если выше что-то догрузится, свет и тени не съедут
    amb.style.setProperty('--lamp-fx', px(fx)); amb.style.setProperty('--lamp-fb', px(AH - fy));
    amb.style.setProperty('--lamp-lb', px(AH - ft));
    shades.style.transformOrigin = px(fx) + ' calc(100% - ' + px(AH - fy) + ')';
    return { x: A.x0 + fx, y: A.y0 + fy, ax: A.x0, ab: A.y0 + AH, k: 1 };
  }

  function clear(el) {
    el.classList.remove('lamp-lit', 'lamp-rel', 'lamp-in', 'lamp-tx');
    [].slice.call(el.children).forEach(function (c) { if (c.classList && (c.classList.contains('lamp-g') || c.classList.contains('lamp-s'))) el.removeChild(c); });
    ['--li', '--lx', '--ly', '--gx', '--gy'].forEach(function (p) { el.style.removeProperty(p); });
  }
  function layer(el, cls, lo) {
    var s = document.createElement('span'); s.className = cls || 'lamp-g'; s.setAttribute('aria-hidden', 'true');
    el.appendChild(s); play(s, frames(lo || .4, 1));
  }
  function skip(el) { return el.closest('.top, .clb, .czoom, .mbar, .hero, [data-lamp=off]') || !el.getClientRects().length; }
  function refresh() {
    clearTimeout(timer); timer = 0;
    anims = anims.filter(function (a) { if (a.effect && a.effect.target && !a.effect.target.isConnected) { a.cancel(); return false; } return true; });
    lit.forEach(clear); lit = []; shades.textContent = '';
    var O = opts();
    amb.classList.toggle('has-lamp', !!O.enabled);
    if (!O.enabled) { L = null; return; }
    L = place(); if (!L) return;
    var W = document.documentElement.clientWidth, sh = O.shadow / 100, cr = O.crisp / 100;
    var R = Math.max(860, innerHeight * 1.3, W * .5) * O.reach / 100, cast = [];
    function measure(el) {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return null;
      var r = box(el); if (!r.w || !r.h) return null;
      var x0 = r.x0, y0 = r.y0, x1 = x0 + r.w, y1 = y0 + r.h;
      var nx = Math.max(x0, Math.min(L.x, x1)), ny = Math.max(y0, Math.min(L.y, y1));
      var d = Math.hypot(L.x - nx, L.y - ny), I = Math.pow(Math.max(0, 1 - d / R), 1.3) * L.k;
      if (I < .05) return null;
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = L.x - cx, dy = L.y - cy, len = Math.hypot(dx, dy) || 1;
      return { r: r, x0: x0, y0: y0, I: I, lx: dx / len, ly: dy / len, gx: (nx - x0) / r.w * 100, gy: (ny - y0) / r.h * 100 };
    }
    function vars(el, m) {
      el.style.setProperty('--li', m.I.toFixed(3)); el.style.setProperty('--lx', m.lx.toFixed(3)); el.style.setProperty('--ly', m.ly.toFixed(3));
      el.style.setProperty('--gx', m.gx.toFixed(1) + '%'); el.style.setProperty('--gy', m.gy.toFixed(1) + '%');
      lit.push(el);
    }
    // отражение света: тёплая кромка и блик со стороны огня
    [].forEach.call(document.querySelectorAll(GLOW), function (el) {
      if (skip(el)) return; var m = measure(el); if (!m) return;
      vars(el, m); el.classList.add('lamp-lit');
      if (getComputedStyle(el).position === 'static') el.classList.add('lamp-rel');
      layer(el);
    });
    [].forEach.call(document.querySelectorAll(INP), function (el) { if (skip(el)) return; var m = measure(el); if (m) { vars(el, m); el.classList.add('lamp-in'); } });
    [].forEach.call(document.querySelectorAll(TXT), function (el) { if (skip(el)) return; var m = measure(el); if (m) { vars(el, m); el.classList.add('lamp-tx'); } });
    // тени от огня — на фоне за элементами (box-shadow снаружи рамки, внутрь стекла не попадает)
    [].forEach.call(document.querySelectorAll(CAST), function (el) {
      if (skip(el)) return;
      var m = measure(el); if (!m || m.I < .08) return;
      if (el.parentElement && el.parentElement.closest(CAST)) {
        // кнопка на карточке: тень ложится на карточку — слой внутри кнопки (у кнопок overflow виден)
        if (!el.matches('.btn, .cta2, .msg, .back')) return;
        if (lit.indexOf(el) < 0) { vars(el, m); el.classList.add('lamp-lit'); if (getComputedStyle(el).position === 'static') el.classList.add('lamp-rel'); }
        return layer(el, 'lamp-s', .62);
      }
      var cs = getComputedStyle(el), s = document.createElement('i'), I = m.I, k = el.matches('.glass, .panel') ? 1.1 : 1;
      // ближняя тень — чёткий контур у края, дальняя — мягкая и длиннее; обе вправо-вниз
      var o1 = 2 + 5 * I, b1 = (1 + 3 * I) * (1.7 - cr), a1 = Math.min(.6, (.16 + .26 * I) * sh * k);
      var o2 = 7 + 16 * I, b2 = (9 + 12 * I) * (1.45 - .55 * cr), a2 = Math.min(.5, (.1 + .18 * I) * sh * k);
      if (a1 < .01 && a2 < .01) return;
      s.style.cssText = 'left:' + px(m.x0 - L.ax) + ';bottom:' + px(L.ab - (m.y0 + m.r.h)) + ';width:' + px(m.r.w) + ';height:' + px(m.r.h) + ';border-radius:' + cs.borderRadius +
        ';box-shadow:' + (DX * o1).toFixed(1) + 'px ' + (DY * o1).toFixed(1) + 'px ' + b1.toFixed(1) + 'px rgba(8,4,2,' + a1.toFixed(3) + '),' +
        (DX * o2).toFixed(1) + 'px ' + (DY * o2).toFixed(1) + 'px ' + b2.toFixed(1) + 'px -2px rgba(10,5,2,' + a2.toFixed(3) + ')';
      cast.push(s);
    });
    cast.forEach(function (s) { shades.appendChild(s); });
  }
  function later() { clearTimeout(timer); timer = setTimeout(refresh, 220); }
  window.pamyatLamp = { refresh: later, source: function () { return L; } };
  document.addEventListener('pamyat:look', later);
  addEventListener('resize', later);
  addEventListener('load', later);
  if ('ResizeObserver' in window) {
    var lastH = 0, lastW = 0;
    new ResizeObserver(function () { var h = document.documentElement.scrollHeight, w = innerWidth; if (Math.abs(h - lastH) > 40 || w !== lastW) { lastH = h; lastW = w; later(); } }).observe(document.body);
    var near = document.querySelector('body > footer'); near = near && near.previousElementSibling;
    if (near) new ResizeObserver(later).observe(near); // контакты: смена высоты сдвигает тени
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  later();
})();
