/* ПАМЯТЬ.БАЙ — поведение главной: шапка, свет лампады, визуализация, калькулятор, формы */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    // кнопки «ловят» свет лампады: чем ближе к источнику (низ-лево страницы), тем теплее отсвет
    var W = innerWidth;
    $$('main .msg, main .btn, main .cta2, footer .btn').forEach(function (el) {
      var r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + scrollY + r.height / 2;
      var d = Math.sqrt(Math.pow(x / (W * 1.1), 2) + Math.pow((H - y) / Math.min(H * 0.42, 1500), 2));
      var lit = Math.max(0, Math.min(1, 1.15 - d));
      el.classList.toggle('lit', lit > 0.02); el.style.setProperty('--lit', lit.toFixed(3));
    });
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

  /* живое дрожание пламени (как в демо: свет не ездит, а дышит) */
  if (!calm) (function flicker() {
    var r = Math.random(), k = 0.82 + Math.random() * 0.19;
    if (r > 0.78) k = 0.70 + Math.random() * 0.12;
    if (r > 0.95) k = 1.02 + Math.random() * 0.10;
    root.style.setProperty('--flicker', k.toFixed(3));
    root.style.setProperty('--fx', ((Math.random() - 0.5) * 11).toFixed(2) + 'px');
    root.style.setProperty('--fy', ((Math.random() - 0.5) * 9).toFixed(2) + 'px');
    setTimeout(flicker, 65 + Math.random() * 145);
  })();

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
  function bindWorks() {
    $('.work').forEach(function (w) {
      w.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var img = w.querySelector('.mat img');
        if (img && lbx && $('#lbimg')) { $('#lbimg').src = img.src; lbx.classList.add('on'); }
      });
    });
  }
  bindWorks();

  /* ---------- карусель примеров работ ---------- */
  var worksCarousel = $('#worksCarousel'), worksTrack = $('#worksGrid');
  var worksPrev = worksCarousel && $('.works-prev', worksCarousel);
  var worksNext = worksCarousel && $('.works-next', worksCarousel);
  var worksPagination = worksCarousel && $('#worksPagination');
  function worksMetrics() {
    var card = worksTrack && $('.work', worksTrack), gap = 18;
    if (worksTrack) {
      var style = getComputedStyle(worksTrack);
      gap = parseFloat(style.columnGap || style.gap || '18') || 18;
    }
    return { max: worksTrack ? Math.max(0, worksTrack.scrollWidth - worksTrack.clientWidth) : 0,
      step: (card ? card.getBoundingClientRect().width : (worksTrack ? worksTrack.clientWidth * .8 : 0)) + gap };
  }
  function refreshWorksCarousel() {
    if (!worksCarousel || !worksTrack) return;
    var metrics = worksMetrics(), max = metrics.max, step = metrics.step;
    var left = worksTrack.scrollLeft > 3;
    var right = worksTrack.scrollLeft < max - 3;
    worksCarousel.classList.toggle('can-left', max > 3 && left);
    worksCarousel.classList.toggle('can-right', max > 3 && right);
    if (worksPrev) worksPrev.hidden = !(max > 3 && left);
    if (worksNext) worksNext.hidden = !(max > 3 && right);
    if (worksPagination) {
      var pages = max > 3 && step > 0 ? Math.max(1, Math.round(max / step) + 1) : 1;
      if (Number(worksPagination.dataset.pageCount) !== pages) {
        worksPagination.dataset.pageCount = String(pages);
        worksPagination.innerHTML = Array.from({ length: pages }, function (_, i) {
          return '<button type="button" class="works-dot' + (i === 0 ? ' active' : '') + '" data-page="' + i +
            '" aria-label="Показать страницу ' + (i + 1) + '"' + (i === 0 ? ' aria-current="true"' : '') + '></button>';
        }).join('');
        worksPagination.hidden = pages < 2;
      }
      var active = max > 3 && pages > 1 ? Math.max(0, Math.min(pages - 1, Math.round(worksTrack.scrollLeft / max * (pages - 1)))) : 0;
      $('.works-dot', worksPagination).forEach(function (dot, i) {
        var on = i === active;
        dot.classList.toggle('active', on);
        if (on) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
      });
    }
  }
  function moveWorks(direction) {
    if (!worksTrack) return;
    var metrics = worksMetrics();
    worksTrack.scrollBy({ left: direction * metrics.step, behavior: calm ? 'auto' : 'smooth' });
  }
  if (worksPrev) worksPrev.addEventListener('click', function () { moveWorks(-1); });
  if (worksNext) worksNext.addEventListener('click', function () { moveWorks(1); });
  if (worksPagination) worksPagination.addEventListener('click', function (e) {
    var dot = e.target.closest('[data-page]');
    if (!dot || !worksTrack) return;
    var metrics = worksMetrics(), pages = Number(worksPagination.dataset.pageCount) || 1;
    var page = Math.max(0, Math.min(pages - 1, Number(dot.dataset.page) || 0));
    worksTrack.scrollTo({ left: pages > 1 ? metrics.max * page / (pages - 1) : 0, behavior: calm ? 'auto' : 'smooth' });
  });
  if (worksTrack) {
    worksTrack.addEventListener('scroll', refreshWorksCarousel, { passive:true });
    worksTrack.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); moveWorks(e.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    if ('ResizeObserver' in window) new ResizeObserver(refreshWorksCarousel).observe(worksTrack);
    else addEventListener('resize', refreshWorksCarousel);
    refreshWorksCarousel();
  }
  if (lbx) lbx.addEventListener('click', function () { lbx.classList.remove('on'); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && lbx) lbx.classList.remove('on'); });

  /* ---------- визуализация установки (компактная, по скроллу) ---------- */
  var story = $('#story');
  if (story) (function () {
    var cv = $('canvas', story), ctx = cv.getContext('2d');
    var items = $$('.sc-item', story), rail = $('.rail', story), fill = $('.rail-line i', story);
    var chap = $('.sc-chapter', story), num = $('.sc-n', story);
    var small = matchMedia('(max-width: 820px)').matches;
    var list = window.STORY_FRAMES || null;                       // превью: кадры вшиты
    var N = list ? list.length : +story.dataset.count;
    var base = small ? story.dataset.framesM : story.dataset.frames;
    var scale = list ? (N - 1) / 245 : 1;                          // кадры каталога 0..245
    var imgs = new Array(N), cur = -1, want = 0;
    function url(i) { return list ? list[i] : base + 'f' + String(i).padStart(4, '0') + '.webp'; }
    function load(i) {
      if (imgs[i]) return;
      var im = new Image(); im.decoding = 'async'; im.src = url(i); imgs[i] = im;
      im.onload = function () { if (Math.abs(i - want) < 3) draw(want, true); };
    }
    // прогрессивная загрузка: каждый 8-й, потом остальные
    for (var s = 0; s < N; s += 8) load(s);
    setTimeout(function () { for (var i = 0; i < N; i++) load(i); }, 1200);

    function size() {
      var r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); cur = -1; draw(want, true);
    }
    function nearest(i) {
      for (var k = 0; k < N; k++) {
        var a = imgs[i - k], b = imgs[i + k];
        if (a && a.complete && a.naturalWidth) return a;
        if (b && b.complete && b.naturalWidth) return b;
      }
      return null;
    }
    function draw(i, force) {
      if (i === cur && !force) return;
      var im = nearest(i); if (!im) return;
      cur = i;
      var cw = cv.width, ch = cv.height, ir = im.naturalWidth / im.naturalHeight, cr = cw / ch, w, h;
      if (cr > ir) { w = cw; h = cw / ir; } else { h = ch; w = ch * ir; }
      ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
    }
    // кнопки этапов
    items.forEach(function (it, k) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = it.dataset.chapter;
      b.addEventListener('click', function () {
        var p = (+it.dataset.f) / 245, r = story.getBoundingClientRect();
        var span = story.offsetHeight - $('.story-sticky', story).offsetHeight;
        scrollTo({ top: scrollY + r.top + p * span + 2, behavior: 'smooth' });
      });
      rail.appendChild(b);
    });
    var btns = $$('button', rail);
    function tick() {
      var r = story.getBoundingClientRect();
      var span = story.offsetHeight - $('.story-sticky', story).offsetHeight;
      var p = Math.min(1, Math.max(0, -r.top / Math.max(1, span)));
      var f = p * 245;                                  // кадр в шкале оригинала
      want = Math.round(f * scale);
      draw(want);
      var k = 0; items.forEach(function (it, j) { if (f >= +it.dataset.f) k = j; });
      items.forEach(function (it, j) { it.classList.toggle('on', j === k); });
      btns.forEach(function (b, j) { b.classList.toggle('on', j === k); });
      chap.textContent = items[k].dataset.chapter; num.textContent = String(k + 1).padStart(2, '0');
      fill.style.width = (p * 100).toFixed(1) + '%';
    }
    var raf = 0;
    addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; tick(); }); }, { passive: true });
    addEventListener('resize', size);
    size(); tick();
  })();

  /* ---------- данные: каталог и калькулятор (из админки, иначе — по умолчанию) ---------- */
  var CAT = window.PAMYAT_CATALOG_DEFAULT || { categories: [], items: [] };
  var CALC = [
    { id: 'foundation', name: 'Основание', type: 'radio', sub: 'Если основание уже есть — выберите только установку. Не нужно — пропустите шаг.', items: [
      { id: 'concrete', name: 'Армированный бетонный фундамент', price: 1000 }, { id: 'ready', name: 'Установка на готовое основание', price: 300 }] },
    { id: 'engraving', name: 'Гравировка', type: 'radio', sub: 'Базовая гравировка (ФИО, даты) уже включена.', items: [
      { id: 'base', name: 'Базовая (ФИО, даты)', price: 0, note: 'включено' }, { id: 'art', name: 'Художественная (портрет, пейзаж)', price: 200 },
      { id: 'medal', name: 'Медальон', price: 250 }] },
    { id: 'land', name: 'Благоустройство', type: 'multi', sub: 'Можно выбрать несколько.', items: [
      { id: 'granite', name: 'Керамогранитная плитка', price: 1600 }, { id: 'curb', name: 'Бетонный бордюр', price: 300 },
      { id: 'paving', name: 'Тротуарная плитка', price: 400 }] },
    { id: 'fence', name: 'Ограда', type: 'radio', sub: 'Ограда считается отдельно от благоустройства.', items: [
      { id: 'none', name: 'Без ограды', price: 0 }, { id: 'granite', name: 'Гранитная ограда', price: 1200 }] },
    { id: 'decor', name: 'Декор', type: 'multi', sub: 'Дополните композицию вазой, искусственной травой или белым щебнем.', items: [
      { id: 'vase', name: 'Гранитная ваза / лампада', price: 200 }, { id: 'grass', name: 'Искусственная трава / белый щебень', price: 80 }] }
  ];
  var Q = new URLSearchParams(location.search);
  var STEPS = [], S = {}, step = 0, MODEL = Q.get('model') || '', MODEL_CAT = Q.get('cat') || '';
  function visibleCats() { return (CAT.categories || []).filter(function (c) { return c.visible !== false; }); }
  function catOf(code) { var it = (CAT.items || []).filter(function (x) { return x.code === code; })[0]; return it ? it.cat : ''; }
  function build() {
    // шаг 1 «Памятник» = разделы каталога; дальше — шаги из админки; последний — контакты
    var first = { id: 'monument', name: 'Памятник', type: 'radio', sub: 'Выберите тип — как в каталоге. Гранит и размеры согласуем лично.', catalog: true,
      items: visibleCats().filter(function (c) { return c.calc !== false; }).map(function (c) { return { id: c.id, name: c.short || c.name, price: c.price == null ? null : +c.price }; }) };
    STEPS = [first].concat(CALC.filter(function (s) { return s.id !== 'monument' && s.items && s.items.length; }))
      .concat([{ id: '__contact', name: 'Контакты', type: 'contact' }]);
    var old = S; S = {};
    STEPS.forEach(function (s) {
      if (s.type === 'contact') return;
      var keep = old[s.id], ok = s.type === 'multi' ? (keep || []).filter(function (id) { return item(s, id); }) : (item(s, keep) ? keep : '');
      S[s.id] = ok;
    });
    var mc = MODEL_CAT || (MODEL && catOf(MODEL));
    if (mc && item(first, mc)) S.monument = mc;
    if (step >= STEPS.length) step = 0;
  }
  function fmt(n) { return Number(n).toLocaleString('ru-RU'); }
  function item(s, id) { return (s.items || []).filter(function (x) { return x.id === id; })[0]; }
  function priceLabel(it) { if (it.note) return it.note; if (it.price == null) return 'инд. расчёт'; return 'от ' + fmt(it.price); }
  function individual() { return STEPS.some(function (s) { return s.type === 'radio' && item(s, S[s.id]) && item(s, S[s.id]).price == null; }); }
  function total() {
    var t = 0;
    STEPS.forEach(function (s) {
      if (s.type === 'contact') return;
      (s.type === 'multi' ? S[s.id] : [S[s.id]]).forEach(function (id) { var it = item(s, id); if (it && it.price) t += +it.price; });
    });
    return t;
  }
  function summary() {
    return STEPS.filter(function (s) { return s.type !== 'contact'; }).map(function (s) {
      var ids = s.type === 'multi' ? S[s.id] : [S[s.id]];
      return s.name + ': ' + (ids.map(function (id) { var it = item(s, id); return it ? it.name : ''; }).filter(Boolean).join(', ') || '—');
    }).join('; ') + (MODEL ? '; Модель: ' + MODEL : '');
  }
  var lastTotal = '';
  function drawTotal() {
    var tv = $('#tv'); if (!tv) return;
    var any = STEPS.some(function (s) { return s.type !== 'contact' && (s.type === 'multi' ? S[s.id].length : S[s.id]); });
    var txt = individual() ? 'Индивидуально' : any ? 'от ' + fmt(total()) + ' BYN' : '0 BYN';
    if ($('#mtv')) $('#mtv').textContent = txt;
    if (txt !== lastTotal) { tv.textContent = txt; tv.classList.remove('bump'); void tv.offsetWidth; tv.classList.add('bump'); lastTotal = txt; }
  }
  function go(n) {
    step = Math.max(0, Math.min(STEPS.length - 1, n)); render();
    if (innerWidth <= 720) { var p = $('#calc .panel'); if (p) scrollTo({ top: p.getBoundingClientRect().top + scrollY - 76, behavior: 'smooth' }); }
  }
  function render() {
    if (!$('#q') || !STEPS.length) return;
    var s = STEPS[step];
    $('#snav').innerHTML = STEPS.map(function (x, i) {
      return '<button type="button" data-step="' + i + '" class="' + (i === step ? 'on' : i < step ? 'done' : '') + '">' + (i + 1) + '. ' + x.name + '</button>';
    }).join('');
    $$('#snav button').forEach(function (b) { b.addEventListener('click', function () { go(+b.dataset.step); }); });
    var on = $('#snav .on'); if (on) $('#snav').scrollLeft = Math.max(0, on.offsetLeft - 16);
    if (s.type === 'contact') {
      var ind = individual();
      $('#q').innerHTML = (ind ? '<div class="qtitle">Обсудим ваш проект</div><div class="qsub">Индивидуальный проект считаем лично. Оставьте имя и телефон — перезвоним, обсудим эскиз, гранит и размеры.</div>'
        : '<div class="qtitle">Куда прислать расчёт?</div><div class="qsub">Оставьте имя и телефон — перезвоним, уточним детали и зафиксируем смету.</div>') +
        '<form class="form qcontact" id="cform"><input required name="name" placeholder="Имя" autocomplete="name"><input required name="phone" type="tel" placeholder="+375 (XX) XXX-XX-XX" autocomplete="tel">' +
        '<textarea name="c" rows="2" placeholder="Комментарий (необязательно)"></textarea>' +
        '<div class="row2"><button class="btn btn-gold" type="submit">' + (ind ? 'Заказать звонок' : 'Отправить заявку') + ' <span class="arr">→</span></button><button class="btn btn-line" type="button" id="qback">← Назад</button></div>' +
        '<p class="muted">Нажимая кнопку, вы соглашаетесь с политикой обработки персональных данных.</p></form><div class="ok" id="cok">Спасибо! Перезвоним в рабочее время и уточним детали.</div>';
      bindForm('#cform', '#cok', 'calc');
      $('#qback').onclick = function () { go(individual() ? 0 : step - 1); };
    } else {
      var pick = s.catalog && S.monument && S.monument !== 'individual'
        ? '<a class="pick" href="/catalog#' + S.monument + '">' + (MODEL ? 'Модель ' + MODEL + ' · выбрать другую' : 'Выбрать модель в каталоге') + ' →</a>' : '';
      $('#q').innerHTML = '<div class="qtitle">' + s.name + '</div><div class="qsub">' + (s.sub || '') + '</div>' + s.items.map(function (o) {
        var on = s.type === 'multi' ? S[s.id].indexOf(o.id) > -1 : S[s.id] === o.id;
        return s.type === 'multi'
          ? '<div class="tog' + (on ? ' on' : '') + '" data-id="' + o.id + '" role="switch" aria-checked="' + on + '" tabindex="0"><span class="sw"></span><span class="t">' + o.name + '</span><span class="p">' + priceLabel(o) + '</span></div>'
          : '<div class="radio' + (on ? ' on' : '') + '" data-id="' + o.id + '" role="radio" aria-checked="' + on + '" tabindex="0"><i></i><span class="t">' + o.name + '</span><span class="p">' + priceLabel(o) + '</span></div>';
      }).join('') + pick + (s.catalog && individual()
        ? '<div class="indcall"><p>Индивидуальный проект считаем лично: по эскизу или фото подберём гранит и размеры. Нажмите «Заказать звонок» — перезвоним и всё обсудим.</p></div>' : '');
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
    $('#next').innerHTML = (s.catalog && individual() ? 'Заказать звонок' : 'Далее') + ' <span class="arr">→</span>';
    if ($('#mnext')) { $('#mnext').innerHTML = $('#next').innerHTML; $('#mnext').style.display = s.type === 'contact' ? 'none' : ''; }
    var html = '';
    var indiv = individual();
    STEPS.forEach(function (x, i) {
      if (x.type === 'contact' || (indiv && i > 0)) return;
      var ids = x.type === 'multi' ? S[x.id] : [S[x.id]];
      var its = ids.map(function (id) { return item(x, id); }).filter(Boolean);
      var rws = its.length ? its.map(function (it) {
        var pr = it.note ? it.note : it.price == null ? 'инд.' : it.price ? fmt(it.price) + ' BYN' : '';
        return '<div class="rw"><span>' + it.name + (i === 0 && MODEL ? ' · ' + MODEL : '') + '</span><i>' + pr + '</i></div>';
      }).join('') : '<div class="rw no"><span>не выбрано</span></div>';
      html += '<li><span class="lb">' + x.name + '</span>' + rws + '</li>';
    });
    $('#sum').innerHTML = html;
    drawTotal();
  }
  if ($('#q')) {
    $('#prev').onclick = function () { if (step > 0) go(step - 1); };
    var nextStep = function () { go(STEPS[step].catalog && individual() ? STEPS.length - 1 : step + 1); };
    $('#next').onclick = nextStep;
    if ($('#mnext')) $('#mnext').onclick = nextStep;
    // нижняя панель с ценой на телефоне — видна, пока на экране калькулятор
    if ($('#mbar')) document.body.appendChild($('#mbar'));   // вне стекла: иначе position:fixed привязывается к панели
    if ('IntersectionObserver' in window && $('#mbar')) new IntersectionObserver(function (es) {
      es.forEach(function (e) { $('#mbar').classList.toggle('on', e.isIntersecting); });
    }, { rootMargin: '-30% 0px -30% 0px' }).observe($('#calc .calc'));
  }
  window.pamyatPickModel = function (code, cat) {
    MODEL = code; MODEL_CAT = cat || catOf(code) || MODEL_CAT; build(); step = 0; render();
    var c = $('#calc'); if (c) c.scrollIntoView({ behavior: 'smooth' });
  };

  /* ---------- каталог на главной: крупно один элемент на раздел ---------- */
  function coverHtml(c) {
    var cv = c.cover || {};
    if (!cv.img) return '<div class="cover ind">✦<span>По вашему эскизу</span></div>';
    return '<div class="cover"><img src="' + cv.img + '" alt="' + c.name + '" loading="lazy" style="--z:' + (cv.zoom || 1) + ';--pos:' + (cv.pos || '50% 50%') + '"></div>';
  }
  function drawTeaser() {
    var box = $('#catTeaser'); if (!box) return;
    box.innerHTML = visibleCats().map(function (c) {
      var n = (CAT.items || []).filter(function (x) { return x.cat === c.id; }).length;
      return '<a class="cc glass rv in" href="/catalog#' + c.id + '">' + coverHtml(c) + '<h3>' + c.name + '</h3>' +
        '<div class="pr">' + (c.price == null ? 'Индивидуальный расчёт' : 'от ' + fmt(c.price) + ' BYN') + '</div>' +
        '<p class="inc">' + (c.inc ? 'Входит: ' + c.inc : (c.desc || '')) + '</p>' +
        '<div class="go"><span>' + (n ? n + ' моделей' : 'Обсудить проект') + '</span><b>Открыть →</b></div></a>';
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

  function applyContent(c) {
    if (!c) return;
    var T = c.texts || {};
    $$('[data-t]').forEach(function (el) { var v = T[el.dataset.t]; if (v) el.textContent = v; });
    var C = c.contacts || {};
    var tel = (C.phone || '').replace(/[^\d+]/g, '');
    if ($('#cPhone') && C.phone) { $('#cPhone').textContent = C.phone; $('#cPhone').href = tel.replace(/\D/g, '').length >= 7 ? 'tel:' + tel : '#contact'; }
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
        var caption = String(w.caption || '').trim() || defaults.caption;
        var description = String(w.description || '').trim() || defaults.description;
        var badge = String(w.badgeText || '').trim();
        var color = workBadgeColor(w.badgeColor);
        var cropX = workCrop(w.cropX), cropY = workCrop(w.cropY);
        return '<figure class="work glass rv in" style="--crop-x:' + cropX + '%;--crop-y:' + cropY + '%">' +
          '<div class="mat">' +
            '<img src="' + workHtmlEscape(w.img || '') + '" loading="lazy" alt="' + workHtmlEscape(caption || 'Пример работы') + '">' +
            (badge ? '<span class="work-badge" style="--badge-color:' + color + '"><i aria-hidden="true"></i>' + workHtmlEscape(badge) + '</span>' : '') +
            '<div class="work-info">' +
              '<div class="work-copy">' +
                (caption ? '<h3>' + workHtmlEscape(caption) + '</h3>' : '') +
                (description ? '<p>' + workHtmlEscape(description) + '</p>' : '') +
              '</div>' +
              '<button class="work-zoom" type="button" aria-label="Увеличить фотографию: ' + workHtmlEscape(caption || 'Пример работы') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"></circle><path d="m15.5 15.5 4.2 4.2"></path></svg></button>' +
            '</div>' +
          '</div></figure>';
      }).join('');
      bindWorks();
      refreshWorksCarousel();
    }
    if (c.catalog && Array.isArray(c.catalog.categories)) { CAT = c.catalog; window.PAMYAT_CATALOG = CAT; document.dispatchEvent(new CustomEvent('pamyat:catalog', { detail: CAT })); }
    if (c.calc && Array.isArray(c.calc.steps)) CALC = c.calc.steps;
    drawTeaser(); build(); render(); themes();
  }
  window.PAMYAT_CATALOG = CAT; window.pamyatThemes = themes;
  drawTeaser(); build(); render(); themes();
  if (!window.PAMYAT_DEMO) {
    fetch('/api/content', { headers: { accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.ok) { d.content.__live = true; applyContent(d.content); } }).catch(function () { });
  }

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
      if (type === 'calc') { lead.price = individual() ? null : total(); lead.config = { summary: summary(), sel: S, model: MODEL }; }
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
