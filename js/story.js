/* ПАМЯТЬ.БАЙ — «От разметки до сдачи»: кинематографичная покадровая сцена по скроллу.
   • дробный кадр + кросс-фейд соседних кадров (плавно даже между рендерами)
   • перераспределение скролла по «силе изменений» кадра (meta.flow): резкие места проходят медленнее
   • инерция кадра (экспоненциальное сглаживание, не зависит от частоты экрана)
   • приоритетная загрузка вокруг текущего кадра, декодирование заранее (ImageBitmap)
   • «камера»: медленный наезд, дыхание, параллакс от мыши; зерно, виньетка, свет */
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

  var list = window.STORY_FRAMES || null;
  var N = list ? list.length : +story.dataset.count;
  var base = small ? story.dataset.framesM : story.dataset.frames;
  var LAST = 245;                                   // шкала data-f у глав
  var scale = (N - 1) / LAST;
  function url(i) { return list ? list[i] : base + 'f' + String(i).padStart(4, '0') + '.webp'; }

  /* ---------- HUD поверх кадра ---------- */
  story.classList.add('sp');
  var hud = document.createElement('div'); hud.className = 'sp-hud'; hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = '<div class="sp-load"><i></i></div><div class="sp-light"></div><div class="sp-grain"></div>' +
    '<div class="sp-tag"><span class="sp-idx"><b>01</b></span><span class="sp-name">Разметка</span></div>' +
    '<div class="sp-time"><span class="sp-pct">0</span>%</div>' +
    '<div class="sp-bar">' + items.map(function (it) {
      return '<i style="left:' + (+it.dataset.f / LAST * 100).toFixed(2) + '%"></i>';
    }).join('') + '<b></b></div>';
  screen.appendChild(hud);
  var hudIdx = $('.sp-idx b', hud), hudName = $('.sp-name', hud), hudPct = $('.sp-pct', hud);
  var hudBar = $('.sp-bar b', hud), loadBar = $('.sp-load i', hud), ticks = $$('.sp-bar i', hud);

  // зерно плёнки: маленькая текстура шума, генерируется один раз
  (function () {
    var c = document.createElement('canvas'); c.width = c.height = 160;
    var g = c.getContext('2d'), d = g.createImageData(160, 160);
    for (var i = 0; i < d.data.length; i += 4) { var v = Math.random() * 255 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
    $('.sp-grain', hud).style.backgroundImage = 'url(' + c.toDataURL('image/png') + ')';
  })();

  /* ---------- карта скролл → кадр ---------- */
  var flow = null, cum = null;
  function buildMap(w) {
    if (!w || w.length < N - 1) w = null;
    cum = new Float64Array(N); var s = 0;
    for (var i = 0; i < N - 1; i++) { cum[i] = s; s += w ? Math.max(.3, +w[Math.round(i / scale)] || 1) : 1; }
    cum[N - 1] = s;
    for (i = 0; i < N; i++) cum[i] /= s;
    flow = !!w;
  }
  buildMap(null);
  if (!list) fetch(base + 'meta.json', { cache: 'force-cache' }).then(function (r) { return r.json(); })
    .then(function (m) { if (m && m.flow && m.count === N) { buildMap(m.flow); kick(); } }).catch(function () {});
  // HOLD: короткая пауза на первом и последнем кадре
  var H0 = 0.035, H1 = 0.05;
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

  /* ---------- загрузка: сначала грубо по всей шкале, потом плотно вокруг текущего ---------- */
  var imgs = new Array(N), ok = new Uint8Array(N), bmp = new Array(N), loaded = 0, active = 0, started = false;
  var MAXQ = small ? 4 : 6, WIN = small ? 14 : 9;
  var coarse = [];
  [32, 16, 8, 4, 2, 1].forEach(function (st) { for (var i = 0; i < N; i += st) if (coarse.indexOf(i) < 0) coarse.push(i); });
  if (coarse.indexOf(N - 1) < 0) coarse.splice(1, 0, N - 1);
  function pickNext() {
    var c = Math.round(disp);
    for (var k = 0; k <= 24; k++) {
      var a = c + k, b = c - k;
      if (a < N && !imgs[a]) return a;
      if (b >= 0 && !imgs[b]) return b;
    }
    for (var j = 0; j < coarse.length; j++) if (!imgs[coarse[j]]) return coarse[j];
    return -1;
  }
  function pump() {
    while (started && active < MAXQ) {
      var i = pickNext(); if (i < 0) return;
      (function (i) {
        var im = new Image(); im.decoding = 'async'; imgs[i] = im; active++;
        if ('fetchPriority' in im) im.fetchPriority = Math.abs(i - disp) < 12 ? 'high' : 'low';
        im.src = url(i);
        var done = function () {
          active--; ok[i] = 1; loaded++;
          loadBar.style.transform = 'scaleX(' + (loaded / N).toFixed(3) + ')';
          if (loaded >= N) hud.classList.add('ready');
          if (Math.abs(i - disp) < 3) dirty = true;
          kick(); pump();
        };
        (im.decode ? im.decode() : Promise.resolve()).then(done, function () { active--; imgs[i] = null; setTimeout(pump, 400); });
      })(i);
    }
  }
  // декодированные кадры вокруг текущего держим как ImageBitmap — без рывков при отрисовке
  var bmpBusy = 0;
  function cacheAround(c) {
    if (!window.createImageBitmap) return;
    c = Math.round(c);
    for (var i = 0; i < N; i++) if (bmp[i] && Math.abs(i - c) > WIN + 4) { if (bmp[i].close) bmp[i].close(); bmp[i] = null; }
    for (var k = 0; k <= WIN && bmpBusy < 3; k++) [c + k, c - k].forEach(function (i) {
      if (i < 0 || i >= N || bmp[i] || !ok[i] || bmpBusy >= 3) return;
      bmp[i] = 'pending'; bmpBusy++;
      createImageBitmap(imgs[i]).then(function (b) { bmpBusy--; if (bmp[i] === 'pending') bmp[i] = b; else b.close && b.close(); },
        function () { bmpBusy--; bmp[i] = null; });
    });
  }
  function src(i) { var b = bmp[i]; return b && b !== 'pending' ? b : (ok[i] ? imgs[i] : null); }
  function nearestIdx(i) {
    for (var k = 0; k < N; k++) { if (i - k >= 0 && ok[i - k]) return i - k; if (i + k < N && ok[i + k]) return i + k; }
    return -1;
  }

  /* ---------- отрисовка ---------- */
  var W = 0, Hh = 0, dirty = true, drawnKey = '', stickyTop = 0;
  function size() {
    var r = cv.getBoundingClientRect(), d = Math.min(small ? 2 : 1.75, devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width * d)); Hh = Math.max(1, Math.round(r.height * d));
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    stickyTop = parseFloat(getComputedStyle(sticky).top) || 0;
    dirty = true; drawnKey = ''; kick();
  }
  function blit(im, a) {
    var iw = im.width || im.naturalWidth, ih = im.height || im.naturalHeight, ir = iw / ih, cr = W / Hh, w, h;
    if (cr > ir) { w = W; h = W / ir; } else { h = Hh; w = Hh * ir; }
    ctx.globalAlpha = a; ctx.drawImage(im, (W - w) / 2, (Hh - h) / 2, w, h);
  }
  function render(f) {
    var i0 = Math.floor(f), t = f - i0, i1 = Math.min(N - 1, i0 + 1);
    t = Math.round(t * 48) / 48;                          // 48 ступеней кросс-фейда хватает глазу
    var a = ok[i0] ? i0 : nearestIdx(i0), b = ok[i1] ? i1 : a;
    if (a < 0) return;
    var key = a + ':' + b + ':' + t;
    if (key === drawnKey && !dirty) return;
    drawnKey = key; dirty = false;
    blit(src(a), 1);
    if (b !== a && t > 0) blit(src(b), t);
    ctx.globalAlpha = 1;
    if (!screen.classList.contains('lit')) screen.classList.add('lit');
  }

  /* ---------- главы ---------- */
  var btns = [];
  items.forEach(function (it) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = it.dataset.chapter;
    b.addEventListener('click', function () { goFrame(+it.dataset.f * scale + .001); });
    rail.appendChild(b); btns.push(b);
    // разбивка заголовка на строки-маски для «выезда» текста
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
  var target = 0, disp = 0, prog = 0, enter = 0, enterD = 0, mx = 0, my = 0, mxD = 0, myD = 0;
  var raf = 0, last = 0, visible = true, t0 = performance.now(), shown = 0, idle = 0;
  function measure() {
    var r = story.getBoundingClientRect(), span = Math.max(1, story.offsetHeight - sticky.offsetHeight);
    prog = Math.min(1, Math.max(0, -r.top / span));
    target = progToFrame(prog);
    // въезд: экран «раскрывается», пока секция подходит к залипанию
    enter = Math.min(1, Math.max(0, 1 - (r.top - stickyTop) / (innerHeight * .75)));
  }
  function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
  function loop(now) {
    raf = 0;
    var dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    measure();
    if (calm) { disp = target; enterD = enter; }
    else {
      disp = damp(disp, target, 11, dt);
      if (Math.abs(disp - target) < .004) disp = target;
      enterD = damp(enterD, enter, 7, dt);
      mxD = damp(mxD, mx, 3.2, dt); myD = damp(myD, my, 3.2, dt);
    }
    // в покое не оставляем «полупрозрачную» смесь двух кадров — мягко доводим до целого кадра
    idle = Math.abs(disp - target) < .01 ? idle + dt : 0;
    var goal = idle > .14 ? Math.round(disp) : disp;
    shown = calm ? goal : damp(shown, goal, idle > .14 ? 7 : 22, dt);
    if (Math.abs(shown - goal) < .003) shown = goal;
    render(shown);
    cacheAround(disp);
    var f245 = disp / scale, k = 0;
    items.forEach(function (it, j) { if (f245 + .01 >= +it.dataset.f) k = j; });
    setChapter(k);
    var pv = frameToProg(disp);
    fill.style.transform = 'scaleX(' + pv.toFixed(4) + ')';
    hudBar.style.transform = 'scaleX(' + (disp / (N - 1)).toFixed(4) + ')';
    hudPct.textContent = Math.round(disp / (N - 1) * 100);

    // камера: медленный наезд к памятнику + еле заметное «дыхание» + параллакс
    var e = enterD, ez = e * e * (3 - 2 * e), q = disp / (N - 1), tt = (now - t0) / 1000;
    var br = calm ? 0 : 1;
    var sc = 1.06 + q * .07 + (1 - ez) * .06;
    var tx = (mxD * -10 + Math.sin(tt * .31) * 2.2 * br) - q * 14;
    var ty = (myD * -7 + Math.cos(tt * .23) * 1.6 * br) - q * 6;
    cv.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + sc.toFixed(4) + ')';
    screen.style.setProperty('--sp-in', ez.toFixed(4));
    screen.style.setProperty('--sp-q', q.toFixed(4));
    screen.style.setProperty('--sp-mx', mxD.toFixed(3));
    screen.style.setProperty('--sp-my', myD.toFixed(3));

    var moving = Math.abs(shown - goal) > .001 || Math.abs(disp - target) > .001 || Math.abs(enterD - enter) > .001 || Math.abs(mxD - mx) > .002 || Math.abs(myD - my) > .002;
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

  // грузим, когда до секции осталось ~2 экрана; крутим цикл только когда секция видна
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting && !started) { started = true; pump(); } });
    }, { rootMargin: '200% 0px' }).observe(story);
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { visible = en.isIntersecting; if (visible) { last = 0; kick(); } });
    }, { rootMargin: '10% 0px' }).observe(story);
  } else { started = true; pump(); }
  setTimeout(function () { if (!started) { started = true; pump(); } }, 2500);

  measure(); disp = shown = target; size(); setChapter(0); kick();
})();
