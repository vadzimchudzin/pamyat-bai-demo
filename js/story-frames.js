/* ПАМЯТЬ.БАЙ — scroll-scrubbed photoreal 3D render (Blender/Cycles frame sequence).
   Canvas 2D, frame blending for sub-frame smoothness, progressive loading (coarse → fine). */
(function () {
  'use strict';
  var sec = document.getElementById('story');
  if (!sec) return;
  var pin = sec.querySelector('.story-pin');
  var canvas = sec.querySelector('#storyCV');
  var fx = sec.querySelector('#storyFX');
  var items = [].slice.call(sec.querySelectorAll('.sc-item'));
  var chapEl = sec.querySelector('.sc-chapter');
  var countEl = sec.querySelector('.sc-count b');
  var totalEl = sec.querySelector('.sc-count em');
  var rail = [].slice.call(sec.querySelectorAll('.rail-btn'));
  var railFill = sec.querySelector('.rail-fill');
  var live = sec.querySelector('.sc-live');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.matchMedia('(max-width: 820px)').matches;
  var VER = 'r3';
  var BASE = small ? '/assets/render-m/' : '/assets/render/';
  var META = null;               // {count, step, w, h, stages:[[frameStart, cardIndex], ...]}
  var PI_ = .05, PO_ = .955;
  var ctx = canvas.getContext('2d');
  var fctx = fx.getContext('2d');
  var imgs = [], ok = [];
  var cw = 2, ch = 2, dirty = true, target = 0, cur = 0, visible = false, lastIdx = -1, raf = 0;

  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function eio(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function pad(n) { return ('000' + n).slice(-4); }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (w !== cw || h !== ch) { canvas.width = fx.width = cw = w; canvas.height = fx.height = ch = h; dirty = true; }
  }

  // ---------- progressive loading: every 16th, 8th, 4th, 2nd, then all ----------
  function startLoading() {
    var N = META.count, order = [], seen = {};
    [16, 8, 4, 2, 1].forEach(function (s) { for (var i = 0; i < N; i += s) if (!seen[i]) { seen[i] = 1; order.push(i); } });
    if (!seen[N - 1]) order.splice(1, 0, N - 1);
    var inflight = 0, k = 0, MAX = 10;
    function pump() {
      while (inflight < MAX && k < order.length) {
        (function (i) {
          inflight++;
          var im = new Image(); im.decoding = 'async';
          im.onload = function () { ok[i] = true; inflight--; dirty = true; pump(); };
          im.onerror = function () { inflight--; pump(); };
          im.src = BASE + 'f' + pad(i) + '.webp?v=' + VER;
          imgs[i] = im;
        })(order[k++]);
      }
    }
    pump();
  }
  function nearest(i, dir) { // nearest loaded frame at or before (dir=-1) / after (dir=1)
    for (var d = 0; d < META.count; d++) { var j = i + d * dir; if (j < 0 || j >= META.count) break; if (ok[j]) return j; }
    return -1;
  }

  var ZOOM = 1;
  function drawCover(im, alpha) {
    var iw = im.naturalWidth, ih = im.naturalHeight, s = Math.max(cw / iw, ch / ih) * ZOOM;
    var w = iw * s, h = ih * s, fxv = small ? .6 : .56, fyv = .6; // slow push-in towards the monument
    var x = (cw - w) * fxv, y = (ch - h) * fyv;
    ctx.globalAlpha = alpha; ctx.drawImage(im, x, y, w, h); ctx.globalAlpha = 1;
  }

  function measure() {
    var r = sec.getBoundingClientRect(), total = sec.offsetHeight - window.innerHeight;
    target = clamp(-r.top / total);
  }

  function stageFor(fi) {
    var st = META.stages, idx = 0;
    for (var i = 0; i < st.length; i++) if (fi >= st[i][0]) idx = st[i][1];
    return idx;
  }
  function setText(idx) {
    if (idx === lastIdx) return; lastIdx = idx;
    items.forEach(function (it, i) { it.classList.toggle('on', i === idx); });
    var it = items[idx];
    chapEl.textContent = it.getAttribute('data-chapter');
    countEl.textContent = '0' + (idx + 1);
    live.classList.toggle('on', it.hasAttribute('data-live'));
    var c = +it.getAttribute('data-ch');
    rail.forEach(function (b, i) { b.classList.toggle('done', i < c); b.classList.toggle('now', i === c); });
  }

  // ---------- sun dust (subtle, lives even when scroll stops) ----------
  var motes = [];
  for (var i = 0; i < 28; i++) motes.push({ x: Math.random() * .6, y: Math.random() * .55, r: 1.2 + Math.random() * 2.6, s: .2 + Math.random() * .8, ph: Math.random() * 6.28 });
  function drawFX(now, e) {
    fctx.clearRect(0, 0, cw, ch);
    if (calm) return;
    var dpr = cw / Math.max(1, canvas.clientWidth), tm = now / 1000;
    fctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var x = ((m.x + tm * .005 * m.s + Math.sin(tm * .3 * m.s + m.ph) * .01) % 1) * cw;
      var y = (((m.y + Math.cos(tm * .25 * m.s + m.ph) * .015 - tm * .003 * m.s) % 1) + 1) % 1 * ch * .7;
      var a = (.05 + .14 * Math.pow(Math.sin(tm * .8 * m.s + m.ph), 2)) * e;
      var g = fctx.createRadialGradient(x, y, 0, x, y, m.r * 3 * dpr);
      g.addColorStop(0, 'rgba(255,232,180,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,220,160,0)');
      fctx.fillStyle = g; fctx.beginPath(); fctx.arc(x, y, m.r * 3 * dpr, 0, 6.283); fctx.fill();
    }
    fctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    resize();
    var d = target - cur;
    cur = calm ? target : cur + d * .16;
    if (Math.abs(d) < 1e-5) cur = target;
    var e = eio(clamp(cur / PI_)), o = clamp((cur - PO_) / (1 - PO_));
    pin.style.setProperty('--e', e.toFixed(4)); pin.style.setProperty('--o', o.toFixed(4)); pin.style.setProperty('--p', cur.toFixed(4));
    pin.classList.toggle('done', o > .45);
    if (!META) { drawFX(now, e); return; }
    var P = clamp((cur - PI_) / (PO_ - PI_));
    railFill.style.transform = 'scaleX(' + P.toFixed(4) + ')';
    ZOOM = 1 + .035 * eio(P);
    var fpos = P * (META.count - 1), i0 = Math.floor(fpos), fr = fpos - i0;
    setText(stageFor(Math.round(fpos) * META.step));
    var a = nearest(i0, -1), b = nearest(Math.min(i0 + 1, META.count - 1), 1);
    if (a < 0 && b < 0) { drawFX(now, e); return; }
    if (a < 0) a = b; if (b < 0) b = a;
    var t = a === b ? 0 : clamp((fpos - a) / (b - a));
    ctx.fillStyle = '#0d0c0a'; ctx.fillRect(0, 0, cw, ch);
    drawCover(imgs[a], 1);
    if (b !== a && t > .001) drawCover(imgs[b], t);   // blend neighbours → continuous motion
    drawFX(now, e);
  }
  function kick() { measure(); if (visible && !raf) raf = requestAnimationFrame(frame); }

  fetch(BASE + 'meta.json?v=' + VER, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
    META = j; totalEl.textContent = '0' + items.length; dirty = true;
    var once = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { startLoading(); once.disconnect(); } }, { rootMargin: '1600px 0px' });
    once.observe(sec);
  });
  new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }, { rootMargin: '150px 0px' }).observe(sec);
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick);
  rail.forEach(function (b) {
    b.addEventListener('click', function () {
      if (!META) return;
      var f = +b.getAttribute('data-f'), P = f / (META.count * META.step - 1);
      var p = PI_ + (PO_ - PI_) * P + .001;
      window.scrollTo({ top: sec.offsetTop + p * (sec.offsetHeight - window.innerHeight), behavior: 'smooth' });
    });
  });
  measure(); setText(0);
})();
