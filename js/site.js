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
  function bindWorks() {
    $$('.work').forEach(function (w) {
      w.addEventListener('click', function () { $('#lbimg').src = w.querySelector('img').src; lbx.classList.add('on'); });
    });
  }
  bindWorks();
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

  /* ---------- содержимое из админки (тексты, контакты, работы, калькулятор) ---------- */
  var DEF_CALC = { steps: [
    { id: 'monument', name: 'Памятник', type: 'radio', sub: 'Форма памятника. В комплект входят стела, тумба и цветник.', items: [
      { id: 'vertical', name: 'Вертикальный', price: 950 }, { id: 'horizontal', name: 'Горизонтальный', price: 1700 },
      { id: 'cross', name: 'В форме креста', price: 1800 }, { id: 'complex', name: 'Мемориальный комплекс', price: 3300 },
      { id: 'exclusive', name: 'Эксклюзивный', price: null, note: 'инд. расчёт' }] },
    { id: 'foundation', name: 'Основание', type: 'radio', sub: 'Выберите один вариант.', items: [
      { id: 'concrete', name: 'Армированный бетонный фундамент', price: 1000 }, { id: 'ready', name: 'Установка на готовое основание', price: 300 }] },
    { id: 'engraving', name: 'Гравировка', type: 'radio', sub: 'Базовая гравировка (ФИО, даты) уже включена.', items: [
      { id: 'base', name: 'Базовая (ФИО, даты)', price: 0, note: 'включено' }, { id: 'art', name: 'Художественная (портрет, пейзаж)', price: 200 },
      { id: 'medal', name: 'Медальон', price: 250 }] },
    { id: 'land', name: 'Благоустройство', type: 'multi', sub: 'Можно выбрать несколько.', items: [
      { id: 'granite', name: 'Гранитная плитка', price: 1600 }, { id: 'curb', name: 'Бетонный бордюр', price: 300 },
      { id: 'paving', name: 'Тротуарная плитка', price: 400 }, { id: 'fence', name: 'Ограда из гранита', price: 1200 }] },
    { id: 'decor', name: 'Декор', type: 'multi', sub: 'Дополните композицию вазой, искусственной травой или белым щебнем.', items: [
      { id: 'vase', name: 'Гранитная ваза / лампада', price: 200 }, { id: 'grass', name: 'Искусственная трава / белый щебень', price: 80 }] }
  ] };
  var STEPS = DEF_CALC.steps, S = {}, step = 0, MODEL = new URLSearchParams(location.search).get('model') || '';
  function resetSel() {
    S = {}; STEPS.forEach(function (s) { S[s.id] = s.type === 'multi' ? [] : (s.items[0] ? s.items[0].id : ''); });
    if (step >= STEPS.length) step = 0;
  }
  function fmt(n) { return Number(n).toLocaleString('ru-RU'); }
  function item(s, id) { return s.items.filter(function (x) { return x.id === id; })[0]; }
  function priceLabel(it) { if (it.note) return it.note; if (it.price == null) return 'инд. расчёт'; return 'от ' + fmt(it.price); }
  function individual() { return STEPS.some(function (s) { return s.type !== 'multi' && item(s, S[s.id]) && item(s, S[s.id]).price == null; }); }
  function total() {
    var t = 0;
    STEPS.forEach(function (s) {
      (s.type === 'multi' ? S[s.id] : [S[s.id]]).forEach(function (id) { var it = item(s, id); if (it && it.price) t += +it.price; });
    });
    return t;
  }
  function summary() {
    return STEPS.map(function (s) {
      var ids = s.type === 'multi' ? S[s.id] : [S[s.id]];
      var names = ids.map(function (id) { var it = item(s, id); return it ? it.name : ''; }).filter(Boolean);
      return s.name + ': ' + (names.join(', ') || '—');
    }).join('; ') + (MODEL ? '; Модель: ' + MODEL : '');
  }
  function render() {
    if (!$('#q') || !STEPS.length) return;
    var s = STEPS[step];
    // вкладки шагов — кликабельные
    $('#snav').innerHTML = STEPS.map(function (x, i) {
      return '<button type="button" data-step="' + i + '" class="' + (i === step ? 'on' : i < step ? 'done' : '') + '">' + (i + 1) + '. ' + x.name + '</button>';
    }).join('');
    $$('#snav button').forEach(function (b) { b.addEventListener('click', function () { step = +b.dataset.step; render(); }); });
    $('#q').innerHTML = '<div class="qtitle">' + s.name + '</div><div class="qsub">' + (s.sub || '') + '</div>' + s.items.map(function (o) {
      var on = s.type === 'multi' ? S[s.id].indexOf(o.id) > -1 : S[s.id] === o.id;
      return s.type === 'multi'
        ? '<div class="tog' + (on ? ' on' : '') + '" data-id="' + o.id + '" role="switch" aria-checked="' + on + '" tabindex="0"><span class="sw"></span><span class="t">' + o.name + '</span><span class="p">' + priceLabel(o) + '</span></div>'
        : '<div class="radio' + (on ? ' on' : '') + '" data-id="' + o.id + '" role="radio" aria-checked="' + on + '" tabindex="0"><i></i><span class="t">' + o.name + '</span><span class="p">' + priceLabel(o) + '</span></div>';
    }).join('');
    $$('[data-id]', $('#q')).forEach(function (el) {
      var act = function () { var id = el.dataset.id; if (s.type === 'multi') { var a = S[s.id], j = a.indexOf(id); j > -1 ? a.splice(j, 1) : a.push(id); } else S[s.id] = id; render(); };
      el.addEventListener('click', act); el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    });
    $('#prev').style.visibility = step ? 'visible' : 'hidden';
    $('#next').textContent = step === STEPS.length - 1 ? 'Рассчитать' : 'Далее →';
    var rows = [];
    STEPS.forEach(function (x, i) {
      var ids = x.type === 'multi' ? S[x.id] : [S[x.id]];
      rows.push([x.name, ids.map(function (id) { var it = item(x, id); return it ? it.name : ''; }).filter(Boolean).join(', ') || '—']);
      if (i === 0 && MODEL) rows.push(['Модель из каталога', MODEL]);
    });
    $('#sum').innerHTML = rows.map(function (r) { return '<li><span>' + r[0] + '</span><span>' + r[1] + '</span></li>'; }).join('');
  }
  if ($('#q')) {
    $('#prev').onclick = function () { if (step > 0) { step--; render(); } };
    $('#next').onclick = function () {
      if (step < STEPS.length - 1) { step++; render(); return; }
      $('#tv').textContent = individual() ? 'Индивидуальный расчёт' : 'от ' + fmt(total()) + ' BYN';
      $('#total').classList.add('on');
    };
    resetSel(); render();
  }
  // выбор модели из каталога
  window.pamyatPickModel = function (code, kind) {
    MODEL = code;
    var first = STEPS[0]; if (kind && first && item(first, kind)) S[first.id] = kind;
    step = 0; render();
    var c = $('#calc'); if (c) c.scrollIntoView({ behavior: 'smooth' });
  };

  function applyContent(c) {
    if (!c) return;
    var T = c.texts || {};
    $$('[data-t]').forEach(function (el) { var v = T[el.dataset.t]; if (v) el.textContent = v; });
    var C = c.contacts || {};
    var tel = (C.phone || '').replace(/[^\d+]/g, '');
    if ($('#cPhone') && C.phone) { $('#cPhone').textContent = C.phone; $('#cPhone').href = tel.replace(/\D/g, '').length >= 7 ? 'tel:' + tel : '#contact'; }
    function link(id, url) { var a = $(id); if (!a) return; if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.hidden = false; } else a.hidden = !!c.__live; }
    link('#cTg', C.telegram ? (/^https?:/.test(C.telegram) ? C.telegram : 'https://t.me/' + C.telegram.replace(/^@/, '')) : '');
    link('#cViber', C.viber ? 'viber://chat?number=' + encodeURIComponent(C.viber.replace(/[^\d+]/g, '')) : '');
    link('#cWa', C.whatsapp ? 'https://wa.me/' + C.whatsapp.replace(/\D/g, '') : '');
    if ($('#cLegal') && (C.company || C.unp)) $('#cLegal').textContent = [C.company, C.unp ? 'УНП ' + C.unp : ''].filter(Boolean).join(' · ');
    if (Array.isArray(c.works) && c.works.length && $('#worksGrid')) {
      $('#worksGrid').innerHTML = c.works.map(function (w) {
        return '<figure class="work glass rv in"><div class="mat"><img src="' + w.img + '" loading="lazy" alt="' + (w.caption || 'Пример работы') + '"></div><p>' + (w.caption || '') + '</p></figure>';
      }).join('');
      bindWorks();
    }
    if (c.calc && Array.isArray(c.calc.steps) && c.calc.steps.length) { STEPS = c.calc.steps.filter(function (s) { return s.items && s.items.length; }); resetSel(); render(); }
  }
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
    ['Какая гарантия?', 'До 5 лет на фундамент и установку. Срок и условия указываем в договоре.']
  ];
  if ($('#qa')) {
    $('#qa').innerHTML = QA.map(function (x) { return '<div class="qa"><button type="button">' + x[0] + '<i></i></button><div class="a"><div><p>' + x[1] + '</p></div></div></div>'; }).join('');
    $$('.qa button').forEach(function (b) { b.addEventListener('click', function () { b.parentElement.classList.toggle('open'); }); });
  }

  /* ---------- формы → заявка (база + Telegram) ---------- */
  function bind(formSel, okSel, type) {
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
  bind('#cform', '#cok', 'calc'); bind('#lform', '#lok', 'contact');
})();
