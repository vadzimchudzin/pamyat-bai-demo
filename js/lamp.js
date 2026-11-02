/* ПАМЯТЬ.БАЙ — свет лампады внизу страницы.
   Пламя (.ambience .flame-light) — источник: элементы рядом получают тёплую кромку со стороны огня,
   мягкий блик и тень от огня. Мерцание — только opacity/transform (WAAPI, синхронно с пламенем),
   расчёт позиций — при загрузке и изменении размеров. */
(function () {
  'use strict';
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BOX = '.btn, .cta2, .msg, .back, .dimensions-skip, .glass, .panel, .radio, .tog, .dim-preset';
  var SHADOW = { BTN: 1, CTA2: 1, MSG: 1, BACK: 1 };
  var INP = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea';
  var TXT = 'main h2, .phone, footer .wrap > span:first-child';
  var DUR = 7800, T0 = null, anims = [], lit = [], timer = 0;
  // неровное дыхание пламени: значения 0..1 (1 — ярче)
  var FL = [1, .78, .93, .64, .88, 1, .7, .9, .58, .84, 1, .74, .95, .66, .86, 1, .72, .9, .62, 1];
  function frames(lo, hi, extra) {
    return FL.map(function (v, i) {
      var f = { opacity: +(lo + (hi - lo) * v).toFixed(3), offset: i / (FL.length - 1) };
      if (extra) Object.assign(f, extra(v));
      return f;
    });
  }
  function play(el, kf, opt) {
    if (calm || !el || !el.animate) return null;
    try {
      var a = el.animate(kf, Object.assign({ duration: DUR, iterations: Infinity, easing: 'ease-in-out' }, opt || {}));
      if (document.timeline && document.timeline.currentTime != null) {
        if (T0 == null) T0 = document.timeline.currentTime;
        a.startTime = T0; // всё мерцает в такт одному пламени
      }
      anims.push(a);
      return a;
    } catch (e) { return null; }
  }
  var flame = document.querySelector('.ambience .flame-light'), breath = document.querySelector('.ambience .light-breath'), amb = document.querySelector('.ambience');
  if (!flame) return;
  // пламя и его отсвет на фоне
  play(flame, frames(.8, 1, function (v) { return { transform: 'translate3d(' + ((v - .8) * 9).toFixed(1) + 'px,' + ((.8 - v) * 7).toFixed(1) + 'px,0) scale(' + (.97 + v * .05).toFixed(3) + ')' }; }));
  play(breath, frames(.7, 1, function (v) { return { transform: 'scale(' + (.96 + v * .06).toFixed(3) + ')' }; }));
  if (amb && window.KeyframeEffect && 'pseudoElement' in KeyframeEffect.prototype) play(amb, frames(.82, 1), { pseudoElement: '::after' });

  function source() {
    var r = flame.getBoundingClientRect(), k = parseFloat(getComputedStyle(flame).opacity);
    return { x: r.left + scrollX + r.width * .24, y: r.top + scrollY + r.height * .76, k: isNaN(k) ? 1 : Math.min(1, k + .25) };
  }
  function clear(el) {
    el.classList.remove('lamp-lit', 'lamp-rel', 'lamp-in', 'lamp-tx');
    [].slice.call(el.children).forEach(function (c) { if (c.classList && (c.classList.contains('lamp-g') || c.classList.contains('lamp-s'))) el.removeChild(c); });
    ['--li', '--lx', '--ly', '--gx', '--gy'].forEach(function (p) { el.style.removeProperty(p); });
  }
  function layer(el, cls, lo, hi) {
    var s = document.createElement('span'); s.className = cls; s.setAttribute('aria-hidden', 'true');
    el.appendChild(s); play(s, frames(lo, hi));
  }
  function skip(el) { return el.closest('.top, .clb, .czoom, .mbar, .hero, [data-lamp=off]') || !el.getClientRects().length; }
  function refresh() {
    clearTimeout(timer); timer = 0;
    anims = anims.filter(function (a) { if (a.effect && a.effect.target && !a.effect.target.isConnected) { a.cancel(); return false; } return true; });
    lit.forEach(clear); lit = [];
    var L = source(), R = Math.max(820, innerHeight * 1.25), sx = scrollX, sy = scrollY;
    function measure(el) {
      var r = el.getBoundingClientRect(); if (!r.width || !r.height) return null;
      var x0 = r.left + sx, y0 = r.top + sy, x1 = x0 + r.width, y1 = y0 + r.height;
      var nx = Math.max(x0, Math.min(L.x, x1)), ny = Math.max(y0, Math.min(L.y, y1));
      var d = Math.hypot(L.x - nx, L.y - ny), I = Math.pow(Math.max(0, 1 - d / R), 1.7) * L.k;
      if (I < .05) return null;
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = L.x - cx, dy = L.y - cy, len = Math.hypot(dx, dy) || 1;
      return { I: I, lx: dx / len, ly: dy / len, gx: (nx - x0) / r.width * 100, gy: (ny - y0) / r.height * 100 };
    }
    function vars(el, m) {
      el.style.setProperty('--li', m.I.toFixed(3)); el.style.setProperty('--lx', m.lx.toFixed(3)); el.style.setProperty('--ly', m.ly.toFixed(3));
      el.style.setProperty('--gx', m.gx.toFixed(1) + '%'); el.style.setProperty('--gy', m.gy.toFixed(1) + '%');
      lit.push(el);
    }
    [].forEach.call(document.querySelectorAll(BOX), function (el) {
      if (skip(el)) return; var m = measure(el); if (!m) return;
      vars(el, m); el.classList.add('lamp-lit');
      if (getComputedStyle(el).position === 'static') el.classList.add('lamp-rel');
      layer(el, 'lamp-g', .55, 1);
      if (SHADOW[(el.classList.contains('btn') && 'BTN') || (el.classList.contains('cta2') && 'CTA2') || (el.classList.contains('msg') && 'MSG') || (el.classList.contains('back') && 'BACK')]) layer(el, 'lamp-s', .7, 1);
    });
    [].forEach.call(document.querySelectorAll(INP), function (el) { if (skip(el)) return; var m = measure(el); if (m) { vars(el, m); el.classList.add('lamp-in'); } });
    [].forEach.call(document.querySelectorAll(TXT), function (el) { if (skip(el)) return; var m = measure(el); if (m) { vars(el, m); el.classList.add('lamp-tx'); } });
  }
  function later() { clearTimeout(timer); timer = setTimeout(refresh, 220); }
  window.pamyatLamp = { refresh: later };
  addEventListener('resize', later);
  addEventListener('load', later);
  if ('ResizeObserver' in window) { var lastH = 0; new ResizeObserver(function () { var h = document.documentElement.scrollHeight; if (Math.abs(h - lastH) > 40) { lastH = h; later(); } }).observe(document.body); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
  later();
})();
