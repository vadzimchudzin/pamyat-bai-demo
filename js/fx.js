/* ПАМЯТЬ.БАЙ — живые детали: огонь внутри кнопок и одинокий голубь в небе первого экрана.
   Ободок кнопок — чистый CSS (css/fx.css). Настройки — js/look.js («Оформление» в админке).
   Анимации идут только у видимых элементов; при «уменьшить движение» голубя нет, огонь не мерцает. */
(function () {
  'use strict';
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BTN = '.btn, .cta2, .msg';
  function opts(g) { try { return (window.PamyatLook && PamyatLook.get()[g]) || {}; } catch (e) { return {}; } }

  /* ---------- огонь внутри кнопок ---------- */
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target.classList.toggle('fx-on', e.isIntersecting && !calm); });
  }, { rootMargin: '60px 0px' }) : null;
  function arm(el) {
    if (!el || el.closest('[data-fx=off]')) return;
    var has = false;
    for (var i = 0; i < el.children.length; i++) if (el.children[i].classList.contains('bf')) { has = true; break; }
    if (!has) { var s = document.createElement('span'); s.className = 'bf'; s.setAttribute('aria-hidden', 'true'); el.insertBefore(s, el.firstChild); }
    if (seen && seen.has(el)) return;
    if (seen) seen.add(el);
    if (io) io.observe(el); else if (!calm) el.classList.add('fx-on');
  }
  function scan(rootEl) {
    if (rootEl.nodeType !== 1) return;
    if (rootEl.matches(BTN)) arm(rootEl);
    [].forEach.call(rootEl.querySelectorAll(BTN), arm);
  }
  scan(document.body);
  if ('MutationObserver' in window) {
    var pend = [], tick = 0;
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.target.nodeType === 1 && m.target.matches && m.target.matches(BTN)) pend.push(m.target); // innerHTML кнопки сменили — вернуть огонь
        [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1 && !(n.classList && n.classList.contains('bf'))) pend.push(n); });
      });
      if (!tick) tick = requestAnimationFrame(function () { tick = 0; var p = pend; pend = []; p.forEach(function (n) { if (n.isConnected) scan(n); }); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- голубь ---------- */
  var hero = document.querySelector('.hero'), sky = hero && hero.querySelector('.sky');
  var flyEl = null, anim = null, wing = null, timer = 0, heroVis = true, first = true;
  /* Спрайт: 12 кадров взмаха (цикл с середины удара вниз) + кадр парения; рендер Blender — tools/dove/dove.py.
     Если картинка не загрузилась — прежний векторный силуэт. */
  var SPRITE = '/assets/img/dove-flap.webp?v=1', FR = 13, GLIDE = 12, CYC = 12, spr = 0; // spr: 0 — не грузили, 1 — грузится, 2 — готов, -1 — ошибка
  function loadSprite() {
    if (spr) return; spr = 1;
    var im = new Image(); im.onload = function () { spr = 2; }; im.onerror = function () { spr = -1; }; im.src = SPRITE;
  }
  var SVG = '<svg class="dove" viewBox="0 0 60 30" aria-hidden="true">' +
    '<path class="w1" fill="#f3f1ec" d="M37.4 21.2C36.4 14.6 33.8 8.4 27.6 3.2c.7 4.6 1.3 7.7 2.5 10.4-1.2-.2-2.3-.6-3.3-1 1.8 3.5 4.3 6.3 6.8 8.9z"/>' +
    '<path fill="#fff" d="M8 22.6l5.4.6c3.6-1.6 8.6-2.6 14.6-2.4 6 .2 11 1 15 .4 2-2 4-3.4 6.8-3.4 2.2 0 3.6 1.2 4.2 2.4l3 .8-3 .8c-.8 2.4-3.2 4.6-7 5.6-6 1.6-13 2-19.5 1.6-4.9-.3-9.1-1.2-12.5-2.4L9.5 28l-1.3-1 3.6-2.4z"/>' +
    '<path class="w2" fill="#fff" d="M33.2 21.6C31.2 14 27.2 7 19.2 1.4c1.5 4.6 2 8.1 3.5 11.1-1.3-.2-2.5-.5-3.7-1.1 1.9 3.8 3.8 7 5.5 10.5z"/></svg>';
  function frameTf(i) { return 'translateX(' + (-i * 100 / FR).toFixed(4) + '%)'; }
  // крылья: 3 серии по 2–4 взмаха, между ними парение 0,5–1,4 с; темп взмахов растёт со скоростью полёта
  function wingPlan(sp) {
    var seg = [], flap = 400 / Math.sqrt(sp), tot = 0, kf = [], t = 0;
    for (var s = 0; s < 3; s++) {
      for (var n = 2 + Math.floor(Math.random() * 3), j = 0; j < n; j++) for (var i = 0; i < CYC; i++) seg.push([i, flap / CYC]);
      seg.push([GLIDE, 500 + Math.random() * 900]);
    }
    seg.forEach(function (x) { tot += x[1]; });
    seg.forEach(function (x) { kf.push({ transform: frameTf(x[0]), offset: t / tot, easing: 'step-end' }); t += x[1]; });
    kf.push({ transform: frameTf(GLIDE), offset: 1 });
    return { kf: kf, dur: tot };
  }
  function visibleSpan() {
    var hr = hero.getBoundingClientRect(), sr = sky.getBoundingClientRect();
    var l = Math.max(hr.left, sr.left, 0), r = Math.min(hr.right, sr.right, document.documentElement.clientWidth);
    var k = sky.offsetWidth ? sr.width / sky.offsetWidth : 1; // кадр медленно «наезжает» (scale)
    var bar = document.querySelector('.top'), hh = bar ? bar.offsetHeight : 64;
    // высота полёта: верхняя полоса неба под шапкой — там нет светлой вуали под заголовком
    var y = hr.top + Math.max(hh + 18, hr.height * .09) + Math.random() * hr.height * .14;
    return { a: (l - sr.left) / k, b: (r - sr.left) / k, y: (y - sr.top) / k, vh: Math.min(hr.height, sr.height) / k };
  }
  function stopWing() { if (wing) { try { wing.cancel(); } catch (e) { } wing = null; } }
  function clearDove() { if (anim) { try { anim.cancel(); } catch (e) { } anim = null; } stopWing(); if (flyEl) flyEl.style.opacity = '0'; }
  function fly(force) {
    if (!sky || !sky.offsetWidth || (calm && !force)) return false;
    var o = opts('dove');
    if (!force && (!o.enabled || document.hidden || !heroVis)) return false;
    if (anim) { if (!force) return false; clearDove(); }
    loadSprite();
    var useSpr = spr !== -1;
    if (flyEl && (flyEl.getAttribute('data-k') === 'spr') !== useSpr) { flyEl.remove(); flyEl = null; }
    if (!flyEl) {
      flyEl = document.createElement('div'); flyEl.className = 'dove-fly'; flyEl.setAttribute('aria-hidden', 'true');
      flyEl.setAttribute('data-k', useSpr ? 'spr' : 'svg');
      flyEl.innerHTML = useSpr ? '<span class="dove-sp"><i style="background-image:url(' + SPRITE + ')"></i></span>' : '<span class="dove-bob">' + SVG + '</span>';
      var c3 = sky.querySelector('.c3'); sky.insertBefore(flyEl, c3 || null); // за ближним облаком
    }
    var size = o.size || 26, op = Math.max(.05, Math.min(1, (o.opacity || 65) / 100)), sp = (o.speed || 100) / 100;
    var V = visibleSpan(), rtl = Math.random() < .5, pad = size * 1.6;
    var x0 = V.a - pad, x1 = V.b + pad; if (rtl) { var t = x0; x0 = x1; x1 = t; }
    var y0 = V.y, drift = (Math.random() - .5) * V.vh * .06, amp = 5 + Math.random() * 8, ph = Math.random() * 6.28;
    var dist = Math.abs(x1 - x0), dur = Math.max(9000, dist / (95 * sp) * 1000);
    flyEl.classList.toggle('rtl', rtl); flyEl.style.setProperty('--dove-w', size + 'px');
    var kf = [], N = 9;
    for (var i = 0; i < N; i++) {
      var f = i / (N - 1), x = x0 + (x1 - x0) * f, y = y0 + drift * f + Math.sin(f * Math.PI * 2 + ph) * amp;
      kf.push({ transform: 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)', opacity: i === 0 || i === N - 1 ? 0 : op * (i === 1 || i === N - 2 ? .7 : 1), offset: f });
    }
    try { anim = flyEl.animate(kf, { duration: dur, easing: 'linear', fill: 'none' }); } catch (e) { return false; }
    var st = useSpr && flyEl.querySelector('.dove-sp>i');
    if (st) try { var wp = wingPlan(sp); wing = st.animate(wp.kf, { duration: wp.dur, iterations: Infinity }); wing.currentTime = Math.random() * wp.dur; } catch (e) { wing = null; }
    flyEl.style.opacity = '';
    anim.onfinish = function () { anim = null; stopWing(); plan(); };
    return true;
  }
  function plan(delay) {
    clearTimeout(timer); timer = 0;
    var o = opts('dove'); if (calm || !o.enabled || !sky) return;
    loadSprite();
    var lo = Math.max(3, o.gapMin || 25), hi = Math.max(lo, o.gapMax || 45);
    var ms = delay != null ? delay : (first ? 6000 + Math.random() * 8000 : (lo + Math.random() * (hi - lo)) * 1000);
    timer = setTimeout(function () { timer = 0; if (fly(false)) first = false; else if (!anim) plan(5000); }, ms);
  }
  if (sky) {
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { heroVis = es[0].isIntersecting; }, { threshold: .2 }).observe(hero);
    document.addEventListener('pamyat:look', function () { if (!opts('dove').enabled) { clearTimeout(timer); timer = 0; clearDove(); } else if (!timer && !anim) plan(); });
    plan();
  }
  window.pamyatDove = { fly: function (force) { return fly(force !== false); } };
})();
