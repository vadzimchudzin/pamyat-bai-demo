/* ПАМЯТЬ.БАЙ — поведение главной: шапка, свет лампады, визуализация, калькулятор, формы */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- шапка + тепло лампады по скроллу ---------- */
  var top = $('#top'), hero = $('#hero');
  /* фон — одно полотно: верх светлый, ниже ~47% страницы — сумерки. Тема текста секции по месту на полотне */
  var EDGE = 0.47;
  function themes() {
    var H = document.documentElement.scrollHeight;
    $$('main > section:not(.hero)').forEach(function (sec) {
      var y = sec.getBoundingClientRect().top + scrollY + Math.min(sec.offsetHeight, innerHeight) * 0.5;
      sec.classList.toggle('tl', y / H < EDGE);
    });
  }
  function onScroll() {
    var h = hero ? hero.offsetHeight : 600;
    if (top) {
      top.classList.toggle('scrolled', scrollY > h * 0.55);
      top.classList.toggle('dk', (scrollY + 40) / document.documentElement.scrollHeight > EDGE + 0.03);
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
  $$('.work').forEach(function (w) {
    w.addEventListener('click', function () { $('#lbimg').src = w.querySelector('img').src; lbx.classList.add('on'); });
  });
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

  /* ---------- калькулятор ---------- */
  var store = window.PamyatStore ? PamyatStore.load() : null;
  var SP = store && store.prices ? store.prices : {};
  var P = {
    monument: Object.assign({ vertical: 950, horizontal: 1700, cross: 1800, complex: 3300, exclusive: 0 }, SP.monument),
    foundation: Object.assign({ concrete: 1000, ready: 300 }, SP.foundation),
    engraving: Object.assign({ base: 0, art: 200, medal: 250 }, SP.engraving),
    land: { granite: (SP.land && SP.land.granite_tile) || 1600, curb: (SP.land && SP.land.concrete_curb) || 300, paving: (SP.land && SP.land.paving) || 400, fence: (SP.land && SP.land.fence) || 1200 },
    decor: Object.assign({ vase: 200, grass: 80 }, SP.decor)
  };
  var STEPS = [
    { k: 'monument', n: 'Памятник', type: 'radio', sub: 'Форма памятника. В комплект входят стела, тумба и цветник.', o: [['vertical', 'Вертикальный'], ['horizontal', 'Горизонтальный'], ['cross', 'В форме креста'], ['complex', 'Мемориальный комплекс'], ['exclusive', 'Эксклюзивный']] },
    { k: 'foundation', n: 'Основание', type: 'radio', sub: 'Выберите один вариант.', o: [['concrete', 'Армированный бетонный фундамент'], ['ready', 'Установка на готовое основание']] },
    { k: 'engraving', n: 'Гравировка', type: 'radio', sub: 'Базовая гравировка (ФИО, даты) уже включена.', o: [['base', 'Базовая (ФИО, даты)'], ['art', 'Художественная (портрет, пейзаж)'], ['medal', 'Медальон']] },
    { k: 'land', n: 'Благоустройство', type: 'multi', sub: 'Можно выбрать несколько.', o: [['granite', 'Гранитная плитка'], ['curb', 'Бетонный бордюр'], ['paving', 'Тротуарная плитка'], ['fence', 'Ограда из гранита']] },
    { k: 'decor', n: 'Декор', type: 'multi', sub: 'Дополните композицию вазой, искусственной травой или белым щебнем.', o: [['vase', 'Гранитная ваза / лампада'], ['grass', 'Искусственная трава / белый щебень']] }
  ];
  var q = new URLSearchParams(location.search);
  var S = { monument: 'vertical', foundation: 'concrete', engraving: 'base', land: [], decor: [], model: q.get('model') || '' };
  var step = 0;
  function fmt(n) { return n.toLocaleString('ru-RU'); }
  function lp(k, id) { if (k === 'engraving' && id === 'base') return 'включено'; if (k === 'monument' && id === 'exclusive') return 'инд. расчёт'; return 'от ' + fmt(P[k][id]); }
  function label(k, id) { var s = STEPS.filter(function (x) { return x.k === k; })[0]; return s.o.filter(function (o) { return o[0] === id; })[0][1]; }
  function total() { var t = P.monument[S.monument] + P.foundation[S.foundation] + P.engraving[S.engraving]; S.land.forEach(function (i) { t += P.land[i]; }); S.decor.forEach(function (i) { t += P.decor[i]; }); return t; }
  function render() {
    if (!$('#q')) return;
    var s = STEPS[step];
    $('#snav').innerHTML = STEPS.map(function (x, i) { return '<span class="' + (i === step ? 'on' : i < step ? 'done' : '') + '">' + (i + 1) + '. ' + x.n + '</span>'; }).join('');
    $('#q').innerHTML = '<div class="qtitle">' + s.n + '</div><div class="qsub">' + s.sub + '</div>' + s.o.map(function (o) {
      var on = s.type === 'multi' ? S[s.k].indexOf(o[0]) > -1 : S[s.k] === o[0];
      return s.type === 'multi'
        ? '<div class="tog' + (on ? ' on' : '') + '" data-id="' + o[0] + '" role="switch" aria-checked="' + on + '" tabindex="0"><span class="sw"></span><span class="t">' + o[1] + '</span><span class="p">' + lp(s.k, o[0]) + '</span></div>'
        : '<div class="radio' + (on ? ' on' : '') + '" data-id="' + o[0] + '" role="radio" aria-checked="' + on + '" tabindex="0"><i></i><span class="t">' + o[1] + '</span><span class="p">' + lp(s.k, o[0]) + '</span></div>';
    }).join('');
    $$('[data-id]', $('#q')).forEach(function (el) {
      var act = function () { var id = el.dataset.id; if (s.type === 'multi') { var a = S[s.k], j = a.indexOf(id); j > -1 ? a.splice(j, 1) : a.push(id); } else S[s.k] = id; render(); };
      el.addEventListener('click', act); el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    });
    $('#prev').style.visibility = step ? 'visible' : 'hidden';
    $('#next').textContent = step === STEPS.length - 1 ? 'Рассчитать' : 'Далее →';
    var rows = [['Памятник', label('monument', S.monument)]];
    if (S.model) rows.push(['Модель из каталога', S.model]);
    rows.push(['Основание', label('foundation', S.foundation)], ['Гравировка', label('engraving', S.engraving)],
      ['Благоустройство', S.land.map(function (i) { return label('land', i); }).join(', ') || '—'], ['Декор', S.decor.map(function (i) { return label('decor', i); }).join(', ') || '—']);
    $('#sum').innerHTML = rows.map(function (r) { return '<li><span>' + r[0] + '</span><span>' + r[1] + '</span></li>'; }).join('');
  }
  if ($('#q')) {
    $('#prev').onclick = function () { if (step > 0) { step--; render(); } };
    $('#next').onclick = function () {
      if (step < STEPS.length - 1) { step++; render(); return; }
      $('#tv').textContent = S.monument === 'exclusive' ? 'Индивидуальный расчёт' : 'от ' + fmt(total()) + ' BYN';
      $('#total').classList.add('on');
    };
    render();
  }
  // выбор модели из каталога (страница /catalog или окно каталога в превью)
  window.pamyatPickModel = function (code, kind) {
    S.model = code; if (kind) S.monument = kind; step = 0; render();
    var c = $('#calc'); if (c) c.scrollIntoView({ behavior: 'smooth' });
  };

  /* ---------- FAQ ---------- */
  var QA = [
    ['Когда можно ставить памятник?', 'Обычно через год после захоронения, когда грунт осядет. Замер и проект можно сделать раньше, чтобы к нужному сроку всё было готово.'],
    ['Что входит в «под ключ»?', 'Изготовление, доставка, фундамент, установка, благоустройство и уборка участка. Всё прописываем в договоре.'],
    ['Работаете ли вы зимой?', 'Изготовление идёт круглый год. Бетонные работы делаем в тёплый сезон, памятник на готовое основание можно установить и зимой.'],
    ['Можно выбрать другой гранит?', 'Да. Памятник может быть изготовлен из любого гранита по вашему выбору — подберём под бюджет и участок.'],
    ['Какая гарантия?', 'До 5 лет на фундамент и установку. Срок и условия указываем в договоре.']
  ];
  if ($('#qa')) {
    $('#qa').innerHTML = QA.map(function (x) { return '<div class="qa"><button type="button">' + x[0] + '<i></i></button><div class="a"><div><p>' + x[1] + '</p></div></div></div>'; }).join('');
    $$('.qa button').forEach(function (b) { b.addEventListener('click', function () { b.parentElement.classList.toggle('open'); }); });
  }

  /* ---------- формы → заявка ---------- */
  function bind(formSel, okSel, type) {
    var f = $(formSel); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(f);
      var lead = { type: type, name: fd.get('name'), phone: fd.get('phone'), comment: fd.get('c') || '', source: location.href, at: new Date().toISOString() };
      if (type === 'calc') { lead.config = S; lead.price = S.monument === 'exclusive' ? null : total(); }
      if (window.PamyatStore) PamyatStore.addLead(lead);
      f.style.display = 'none'; $(okSel).classList.add('on');
    });
  }
  bind('#cform', '#cok', 'calc'); bind('#lform', '#lok', 'contact');
})();
