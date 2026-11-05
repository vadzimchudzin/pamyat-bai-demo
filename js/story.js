/* ПАМЯТЬ.БАЙ — «От разметки до сдачи»: покадровый 3D-ролик (Blender/Cycles) по скроллу, v4.
   Кадры хранятся «дельтами» (assets/story/meta.json, мобильная версия — assets/story-m):
   • plate.webp — фото-фон участка; k####.webp — ключ каждые meta.key кадров (всё, чем кадр отличается от фона);
   • f####.webp — атлас прямоугольников, изменившихся относительно предыдущего кадра.
   Кадр собирается на внутреннем холсте 1:1 (без потерь резкости), на экран выводится с «камерой»
   (медленный наезд, дыхание, параллакс) и кросс-фейдом к следующему кадру — плавно при любой скорости скролла.
   Загрузка: по мере подхода к секции, приоритет — текущее место ролика; память — только окно вокруг кадра. */
(function () {
  'use strict';
  var story = document.getElementById('story');
  if (!story) return;
  var $ = function (s, r) { return (r || story).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || story).querySelectorAll(s)); };
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = matchMedia('(max-width: 820px)').matches;
  var fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  var screen = $('.story-screen'), cv = $('canvas', screen), ctx = cv.getContext('2d', { alpha: false });
  var sticky = $('.story-sticky');
  var items = $$('.sc-item'), rail = $('.rail'), fill = $('.rail-line i');
  var chap = $('.sc-chapter'), num = $('.sc-n');
  var base = (small ? story.dataset.framesM : story.dataset.frames) || '/assets/story/';
  var N = Math.max(2, +story.dataset.count || 2), LAST = N - 1;

  /* ---------- HUD поверх кадра ---------- */
  story.classList.add('sp');
  var hud = document.createElement('div'); hud.className = 'sp-hud'; hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = '<div class="sp-load"><i></i></div><div class="sp-light"></div>' +
    '<div class="sp-tag"><span class="sp-idx"><b>01</b></span><span class="sp-name">Разметка</span></div>' +
    '<div class="sp-time"><span class="sp-pct">0</span>%</div>' +
    '<div class="sp-bar">' + items.map(function (it) {
      return '<i style="left:' + (Math.min(1, +it.dataset.f / LAST) * 100).toFixed(2) + '%"></i>';
    }).join('') + '<b></b></div>';
  screen.appendChild(hud);
  var hudIdx = $('.sp-idx b', hud), hudName = $('.sp-name', hud), hudPct = $('.sp-pct', hud);
  var hudBar = $('.sp-bar b', hud), loadBar = $('.sp-load i', hud), ticks = $$('.sp-bar i', hud);

  /* ---------- карта скролл → кадр (meta.flow: резкие места проходят медленнее) ---------- */
  var cum = null;
  function buildMap(w) {
    if (!w || w.length < N - 1) w = null;
    cum = new Float64Array(N); var s = 0;
    for (var i = 0; i < N - 1; i++) { cum[i] = s; s += w ? Math.max(.3, +w[i] || 1) : 1; }
    cum[N - 1] = s;
    for (i = 0; i < N; i++) cum[i] /= s;
  }
  buildMap(null);
  var H0 = 0.03, H1 = 0.05;          // короткая пауза на первом и последнем кадре
  function progToFrame(p) {
    var q = Math.min(1, Math.max(0, (p - H0) / (1 - H0 - H1)));
    var lo = 0, hi = N - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (cum[m] <= q) lo = m; else hi = m; }
    var span = cum[hi] - cum[lo] || 1;
    return lo + Math.min(1, (q - cum[lo]) / span);
  }
  function frameToProg(f) {
    f = Math.min(N - 1, Math.max(0, f));
    var i = Math.floor(f), t = f - i, q = i >= N - 1 ? 1 : cum[i] + (cum[i + 1] - cum[i]) * t;
    return H0 + q * (1 - H0 - H1);
  }

  /* ---------- данные ролика ---------- */
  var meta = null, K = 40, IW = 0, IH = 0;
  var blob = {}, req = {}, dec = {}, decBusy = 0, total = 1, loadedN = 0, fails = 0;
  var conn = navigator.connection || {}, lite = !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
  var MAXQ = lite ? 2 : small ? 6 : 8, AHEAD = small ? 36 : 48, MAXDEC = 3;
  var started = false, near = false, visible = true, seen = false;
  function pad4(i) { return String(i).padStart(4, '0'); }
  function keyOf(i) { return i - i % K; }
  function rectsOf(id) {
    if (id === 'p') return null;
    return id.charAt(0) === 'k' ? meta.keys[id.slice(1)] : meta.frames[+id.slice(1)];
  }
  function hasFile(id) { if (id === 'p') return true; var r = rectsOf(id); return !!(r && r.length); }
  function fileOf(id) { return id === 'p' ? 'plate.webp' : id.charAt(0) + pad4(+id.slice(1)) + '.webp'; }
  function ready(id) { return !hasFile(id) || !!dec[id] && dec[id] !== 1; }   // данных нет (кадр не менялся) — тоже «готово»

  fetch(base + 'meta.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (m) {
    if (!m || m.v !== 2) return;
    meta = m; K = m.key || 40; IW = m.w; IH = m.h; CP = K % 8 ? (K % 10 ? K : 10) : 8;
    if (m.count && m.count !== N) { N = m.count; LAST = N - 1; }
    for (var i = 0; i < N; i++) if (hasFile('f' + i)) total++;
    for (var k in m.keys) if (hasFile('k' + k)) total++;
    buildMap(m.flow);
    initCanvases(); pump(); kick();
  }).catch(function () {});

  /* сеть: файлы в порядке важности для текущего места ролика */
  function want(id) { return hasFile(id) && !req[id]; }
  function pickNext() {
    if (want('p')) return 'p';
    var c = Math.min(N - 1, Math.round(disp)), k0 = keyOf(c), j, id;
    if (k0 > 0 && want(id = 'k' + k0)) return id;
    for (j = k0; j <= c; j++) if (want(id = 'f' + j)) return id;
    var ah = Math.min(N - 1, c + AHEAD);
    for (j = c + 1; j <= ah; j++) {
      if (j % K === 0 && want(id = 'k' + j)) return id;
      if (want(id = 'f' + j)) return id;
    }
    if (!seen && !visible) return null;                  // пока секцию не видели — только начало
    for (j = K; j < N; j += K) if (want(id = 'k' + j)) return id;      // ключи: быстрый переход в любое место
    if (lite) return null;
    for (j = ah + 1; j < N; j++) if (want(id = 'f' + j)) return id;
    for (var s = keyOf(c) - K; s >= 0; s -= K) for (j = s; j < s + K; j++) if (want(id = 'f' + j)) return id;
    return null;
  }
  var active = 0;
  function pump() {
    while (meta && started && near && active < MAXQ) {
      var id = pickNext(); if (!id) return;
      req[id] = 1; active++;
      (function (id) {
        fetch(base + fileOf(id) + (meta.rev ? '?r=' + meta.rev : '')).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
          active--; blob[id] = b; loadedN++;
          loadBar.style.transform = 'scaleX(' + Math.min(1, loadedN / total).toFixed(3) + ')';
          if (loadedN >= total) hud.classList.add('ready');
          kick(); pump();
        }, function () { active--; req[id] = 0; fails++; setTimeout(pump, Math.min(8000, 400 * fails)); });
      })(id);
    }
  }

  /* декодирование: только окно вокруг текущего кадра */
  function decode(id) {
    if (dec[id] || !blob[id] || decBusy >= MAXDEC) return;
    dec[id] = 1; decBusy++;
    var b = blob[id];
    var p = window.createImageBitmap ? createImageBitmap(b) : new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = URL.createObjectURL(b);
    });
    p.then(function (bm) { decBusy--; if (dec[id] === 1) dec[id] = bm; else if (bm.close) bm.close(); kick(); },
      function () { decBusy--; dec[id] = 0; delete blob[id]; req[id] = 0; pump(); });
  }
  function drop(id) { var b = dec[id]; if (b && b !== 1 && b.close) b.close(); delete dec[id]; }
  function manageDecode(c) {
    c = Math.min(N - 1, Math.max(0, Math.round(c)));
    var k0 = keyOf(c), lo = Math.max(0, Math.min(k0, c - 2 * CP - 2)), hi = Math.min(N - 1, c + (small ? 20 : 28));
    decode('p');
    if (k0 > 0) decode('k' + k0);
    for (var j = Math.max(k0, lo); j <= hi; j++) { if (j % K === 0 && j > 0) decode('k' + j); decode('f' + j); }
    if (k0 - K >= 0) { if (k0 - K > 0) decode('k' + (k0 - K)); }
    for (var id in dec) {
      if (id === 'p') continue;
      var n = +id.slice(1);
      if (id.charAt(0) === 'k' ? (n < k0 - K || n > k0 + 2 * K) : (n < lo - 8 || n > hi + 8)) drop(id);
    }
  }

  /* ---------- сборка кадра: холсты в размере кадра ---------- */
  var A = null, B = null, CP = 8, cps = [], CPMAX = small ? 5 : 6;
  function mk() {
    var c = document.createElement('canvas'); c.width = IW; c.height = IH;
    var g = c.getContext('2d', { alpha: false }); g.imageSmoothingEnabled = false;
    return { c: c, g: g, f: -1 };
  }
  function initCanvases() { A = mk(); B = mk(); }
  function apply(S, id) {
    var r = rectsOf(id); if (!r || !r.length) return true;
    var bm = dec[id]; if (!bm || bm === 1) return false;
    for (var i = 0; i < r.length; i++) { var q = r[i]; S.g.drawImage(bm, q[4], q[5], q[2], q[3], q[0], q[1], q[2], q[3]); }
    return true;
  }
  function copy(D, S) { D.g.drawImage(S.c, 0, 0); D.f = S.f; D.from = -1; }
  function segStart(S, k) {           // S ← состояние кадра k (начало отрезка)
    if (!ready('p')) return false;
    if (k === 0) {
      if (!ready('f0')) return false;
      S.g.drawImage(dec.p, 0, 0); apply(S, 'f0'); S.f = 0; return true;
    }
    if (!ready('k' + k)) return false;
    S.g.drawImage(dec.p, 0, 0); apply(S, 'k' + k); S.f = k; return true;
  }
  function saveCP(S) {
    if (S.f % CP) return;
    for (var i = 0; i < cps.length; i++) if (cps[i].f === S.f) return;
    var c;
    if (cps.length < CPMAX) { c = mk(); cps.push(c); }
    else {                              // заменяем самую далёкую от текущего кадра
      var far = 0, fd = -1;
      for (i = 0; i < cps.length; i++) { var d = Math.abs(cps[i].f - S.f); if (d > fd) { fd = d; far = i; } }
      c = cps[far];
    }
    copy(c, S);
  }
  // A ← состояние кадра j (насколько позволяют загруженные данные); возвращает достигнутый кадр
  function build(j) {
    if (!A) return -1;
    if (A.f === j) return j;
    var k = keyOf(j), best = null, i, c;
    for (i = 0; i < cps.length; i++) { c = cps[i]; if (c.f >= k && c.f <= j && (!best || c.f > best.f)) best = c; }
    if (A.f >= k && A.f < j) { if (best && best.f > A.f + 2) copy(A, best); }     // вперёд по отрезку (или с ближней контрольной точки)
    else if (best) copy(A, best);
    else if (segStart(A, k)) saveCP(A);
    else return A.f;
    while (A.f < j) {
      var n = A.f + 1;
      if (!ready('f' + n)) break;
      apply(A, 'f' + n); A.f = n; saveCP(A);
    }
    return A.f;
  }
  // B ← A + дельта кадра i+1 (для кросс-фейда); вне её прямоугольников B совпадает с A — швов нет
  function buildNext(i) {
    var n = i + 1, r = n < N ? rectsOf('f' + n) : null;
    if (!r || !r.length || !ready('f' + n)) return false;
    if (B.f === n && B.from === i) return true;
    copy(B, A); apply(B, 'f' + n); B.f = n; B.from = i;
    return true;
  }

  /* ---------- вывод на экран ---------- */
  var W = 0, Hh = 0, dpr = 1, stickyTop = 0, lit = false;
  function size() {
    var r = cv.getBoundingClientRect(); dpr = Math.min(small ? 2 : 1.75, devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width * dpr)); Hh = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    stickyTop = parseFloat(getComputedStyle(sticky).top) || 0;
    drawn = ''; kick();
  }
  var drawn = '';
  function draw(f, zoom, tx, ty) {
    if (!meta || !A) return;
    var i = Math.min(N - 1, Math.max(0, Math.floor(f))), t = f - i;
    var a = build(i);
    if (a < 0) return;
    var fade = a === i && t > 0.004 && buildNext(i);
    t = Math.round(t * 64) / 64;
    var key = a + '|' + (fade ? t : 0) + '|' + zoom.toFixed(4) + '|' + tx.toFixed(1) + '|' + ty.toFixed(1) + '|' + W + 'x' + Hh;
    if (key === drawn) return;
    drawn = key;
    // «камера»: вписываем кадр с обрезкой (cover), наезд вокруг точки 58%/62%, сдвиг; края всегда закрыты
    var s0 = Math.max(W / IW, Hh / IH), s = s0 * zoom;
    var ox = .58 * W, oy = .62 * Hh;
    var e = (W - IW * s0) / 2, g = (Hh - IH * s0) / 2;
    var X = (e - ox) * zoom + ox + tx * dpr, Y = (g - oy) * zoom + oy + ty * dpr;
    X = Math.min(0, Math.max(W - IW * s, X)); Y = Math.min(0, Math.max(Hh - IH * s, Y));
    ctx.setTransform(s, 0, 0, s, X, Y);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 1; ctx.drawImage(A.c, 0, 0);
    if (fade && t > 0) {
      var r = rectsOf('f' + (i + 1)); ctx.globalAlpha = t;
      for (var k = 0; k < r.length; k++) {
        var q = r[k], x0 = Math.max(0, q[0] - 2), y0 = Math.max(0, q[1] - 2);
        var x1 = Math.min(IW, q[0] + q[2] + 2), y1 = Math.min(IH, q[1] + q[3] + 2);
        ctx.drawImage(B.c, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      }
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!lit) { lit = true; screen.classList.add('lit'); }
  }

  /* ---------- главы ---------- */
  var btns = [];
  items.forEach(function (it) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = it.dataset.chapter;
    b.addEventListener('click', function () { goFrame(+it.dataset.f + .001); });
    rail.appendChild(b); btns.push(b);
    var h = $('h3', it); if (h && !h.querySelector('.sp-ln')) h.innerHTML = '<span class="sp-ln"><span>' + h.innerHTML + '</span></span>';
  });
  function goFrame(f) {
    var r = story.getBoundingClientRect(), span = story.offsetHeight - sticky.offsetHeight;
    var y = scrollY + r.top + frameToProg(f) * span + 2;
    if (window.PAMYAT_LENIS) window.PAMYAT_LENIS.scrollTo(y, { duration: 1.1 });
    else window.scrollTo({ top: y, behavior: calm ? 'auto' : 'smooth' });
  }
  var curK = -1, dir = 1;
  function setChapter(k) {
    if (k === curK) return;
    dir = k > curK ? 1 : -1; story.style.setProperty('--sp-dir', dir);
    curK = k;
    items.forEach(function (it, j) { it.classList.toggle('on', j === k); it.classList.toggle('past', j < k); });
    btns.forEach(function (b, j) { b.classList.toggle('on', j === k); });
    ticks.forEach(function (t, j) { t.classList.toggle('on', j <= k); });
    var n = String(k + 1).padStart(2, '0'), name = items[k].dataset.chapter;
    chap.textContent = name; num.textContent = n;
    hudName.textContent = name;
    hudIdx.classList.remove('roll'); void hudIdx.offsetWidth; hudIdx.textContent = n; hudIdx.classList.add('roll');
  }

  /* ---------- главный цикл ---------- */
  var target = 0, disp = 0, shown = 0, prog = 0, enter = 0, enterD = 0, mx = 0, my = 0, mxD = 0, myD = 0;
  var raf = 0, last = 0, t0 = performance.now(), idle = 0;
  function measure() {
    var r = story.getBoundingClientRect(), span = Math.max(1, story.offsetHeight - sticky.offsetHeight);
    prog = Math.min(1, Math.max(0, -r.top / span));
    target = progToFrame(prog);
    enter = Math.min(1, Math.max(0, 1 - (r.top - stickyTop) / (innerHeight * .75)));
  }
  function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
  function loop(now) {
    raf = 0;
    var dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    measure();
    if (calm) { disp = target; enterD = enter; }
    else {
      disp = damp(disp, target, 10, dt);
      if (Math.abs(disp - target) < .004) disp = target;
      enterD = damp(enterD, enter, 7, dt);
      mxD = damp(mxD, mx, 3.2, dt); myD = damp(myD, my, 3.2, dt);
    }
    // в покое не оставляем смесь двух кадров — мягко доводим до целого
    idle = Math.abs(disp - target) < .01 ? idle + dt : 0;
    var goal = idle > .14 ? Math.round(disp) : disp;
    shown = calm ? goal : damp(shown, goal, idle > .14 ? 7 : 24, dt);
    if (Math.abs(shown - goal) < .003) shown = goal;

    var e = enterD, ez = e * e * (3 - 2 * e), q = disp / (N - 1), tt = (now - t0) / 1000, br = calm ? 0 : 1;
    var zoom = 1.05 + q * .07 + (1 - ez) * .05;
    var tx = (mxD * -10 + Math.sin(tt * .31) * 2.2 * br) - q * 12;
    var ty = (myD * -7 + Math.cos(tt * .23) * 1.6 * br) - q * 5;
    if (meta) { manageDecode(shown); draw(shown, zoom, tx, ty); }

    var k = 0;
    items.forEach(function (it, j) { if (disp + .01 >= +it.dataset.f) k = j; });
    setChapter(k);
    fill.style.transform = 'scaleX(' + frameToProg(disp).toFixed(4) + ')';
    hudBar.style.transform = 'scaleX(' + (disp / (N - 1)).toFixed(4) + ')';
    hudPct.textContent = Math.round(disp / (N - 1) * 100);
    screen.style.setProperty('--sp-in', ez.toFixed(4));
    screen.style.setProperty('--sp-q', q.toFixed(4));
    screen.style.setProperty('--sp-mx', mxD.toFixed(3));
    screen.style.setProperty('--sp-my', myD.toFixed(3));

    var built = !meta || !A || A.f === Math.floor(Math.min(N - 1, shown));
    var moving = Math.abs(shown - goal) > .001 || Math.abs(disp - target) > .001 || Math.abs(enterD - enter) > .001 ||
      Math.abs(mxD - mx) > .002 || Math.abs(myD - my) > .002 || !built || decBusy > 0;
    if (visible && (moving || !calm)) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', function () { size(); });
  if (fine && !calm) screen.addEventListener('pointermove', function (e) {
    var r = screen.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width - .5; my = (e.clientY - r.top) / r.height - .5; kick();
  });
  if (fine) screen.addEventListener('pointerleave', function () { mx = my = 0; kick(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { near = en.isIntersecting; if (near) { started = true; pump(); } });
    }, { rootMargin: '150% 0px' }).observe(story);
    new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        visible = en.isIntersecting;
        if (visible) { seen = true; last = 0; kick(); pump(); }
      });
    }, { rootMargin: '10% 0px' }).observe(story);
  } else { started = near = seen = true; }

  measure(); disp = shown = target; size(); setChapter(0); kick();
  window.PAMYAT_STORY = { frame: function () { return A ? A.f : -1; }, target: function () { return target; }, count: function () { return N; } };
})();
