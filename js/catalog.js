/* ПАМЯТЬ.БАЙ — каталог: разделы, модели, карточка модели с тремя вариантами камня. Данные — из админки. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var box = $('#catBox'); if (!box) return;
  var CAT = window.PAMYAT_CATALOG || window.PAMYAT_CATALOG_DEFAULT || { categories: [], items: [] };
  var cur = null, list = [], idx = 0;
  var COARSE = window.matchMedia && matchMedia('(pointer:coarse)').matches;
  var LX = window.PamyatLux || null; // js/catalog-lux.js: студийные фото, золотые рамки, лупа «Детали»
  function fmt(n) { return Number(n).toLocaleString('ru-RU'); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function cats() { return (CAT.categories || []).filter(function (c) { return c.visible !== false; }); }
  function items(id) { return (CAT.items || []).filter(function (x) { return x.cat === id; }); }
  function price(c) { return c.price == null || c.price === '' ? 'Индивидуальный расчёт' : 'от ' + fmt(c.price) + ' BYN'; }
  function hasOwnPrice(m) { return m && Object.prototype.hasOwnProperty.call(m, 'price'); }
  function itemPrice(m, c) {
    if (!hasOwnPrice(m)) return c && c.price != null && c.price !== '' ? price(c) : '';
    return m.price == null || m.price === '' ? 'Цена по запросу' : 'от ' + fmt(m.price) + ' BYN';
  }
  function isAddon(c) { return !!c && (c.id === 'accessories' || c.calc === false); }
  // комплексы и ограды показываем одним фото (без трёх вариантов камня); в админке можно задать stones: true/false
  function multiStone(c) { return !!c && (c.stones === true || (c.stones !== false && c.id !== 'complex' && c.id !== 'fence')); }
  function itemTitle(m, c) { return m.name ? m.name : ((c.short || '') + ' ' + m.code).trim(); }

  /* ---------- размеры фото: sm 640 (сетка), md 1600 (карточка), оригинал 4K (увеличение) ---------- */
  // все фото каталога пересняты студией (tools/media/studio.py) — новый адрес ?v=…, чтобы браузер не взял старую копию из кэша
  function fresh(u) { return LX ? LX.url(u) : (u || ''); }
  function assetFile(u) { var m = /^\/assets\/catalog\/([A-Za-z0-9_.-]+\.webp)(?:[?#].*)?$/.exec(u || ''); return m ? m[1] : ''; }
  function sized(u, size) {
    if (!u || !size) return fresh(u);
    if (LX) return LX.sized(u, size);
    var f = assetFile(u);
    if (f) return '/assets/catalog/' + size + '/' + f;
    if (/^\/api\/img\?/.test(u) && !/[?&]w=/.test(u)) return u + '&w=' + (size === 'sm' ? 640 : 1600);
    return u;
  }
  function studio(u, flag) { return LX ? LX.isStudio(u, flag) : false; }
  function lxFrame(r) { return LX ? LX.glint() + LX.frame(r) : ''; }
  function imgTag(u, alt, sizes, extra) {
    var sm = sized(u, 'sm'), md = sized(u, 'md'), set = sm !== md ? ' srcset="' + esc(sm) + ' 640w, ' + esc(md) + ' 1600w" sizes="' + sizes + '"' : '';
    return '<img loading="lazy" decoding="async" src="' + esc(sm) + '"' + set + ' data-full="' + esc(fresh(u)) + '" alt="' + esc(alt) + '"' + (extra || '') + '>';
  }
  // нет уменьшенной копии — показываем оригинал
  document.addEventListener('error', function (e) {
    var t = e.target; if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.full) return;
    if (t.getAttribute('src') === t.dataset.full) return;
    t.removeAttribute('srcset'); t.removeAttribute('sizes'); t.src = t.dataset.full;
  }, true);

  function cover(c) {
    var cv = c.cover || {};
    // «По вашему эскизу»: линейный эскиз стелы вместо символа ✦ (на части устройств он был пустым квадратом)
    if (!cv.img) return '<div class="cover lx-stage ind">' + (LX ? LX.sketch() : '') + '<span>По вашему эскизу</span>' + (LX ? LX.frame(10) : '') + '</div>';
    var s = LX ? LX.cover(cv) : { img: cv.img, zoom: cv.zoom || 1, pos: cv.pos || '', studio: false };
    return '<div class="cover lx-stage' + (s.studio ? '' : ' raw') + '">' + imgTag(s.img, c.name, '(max-width:720px) 92vw, 400px', ' style="--z:' + s.zoom + ';--pos:' + esc(s.pos || '50% 50%') + '"') + lxFrame(10) + '</div>';
  }
  function lxDone() { if (LX) { LX.applyLook(CAT); LX.reveal(box); } }
  function themes() { if (window.pamyatThemes) setTimeout(window.pamyatThemes, 30); if (window.pamyatLamp) setTimeout(window.pamyatLamp.refresh, 60); }
  function title(eyebrow, h, lead, back) {
    $('#catTitle').innerHTML = '<div class="cat-back">' + back + '</div><p class="eyebrow">' + eyebrow + '</p><h2>' + h + '</h2>' + (LX ? LX.rule() : '') + (lead ? '<p class="lead">' + lead + '</p>' : '');
  }

  function home() {
    cur = null;
    title('Каталог', 'Каталог памятников', 'Выберите раздел и модель. Гранит, размеры и гравировку согласуем с вами лично.', '<a class="back" href="/" data-home>← На главную</a>');
    box.innerHTML = '<div class="cats">' + cats().map(function (c, i) {
      var n = items(c.id).length;
      return '<a class="cc glass lx" style="--d:' + ((i % 3) * 0.09).toFixed(2) + 's" href="#' + esc(c.id) + '">' + cover(c) + '<h3>' + esc(c.name) + '</h3>' + (LX ? LX.rule() : '') + '<div class="pr">' + price(c) + '</div>' +
        '<p class="inc">' + esc(c.inc ? 'Входит: ' + c.inc : (c.desc || '')) + '</p><div class="go"><span>' + (n ? n + ' ' + (isAddon(c) ? plural(n, 'изделие', 'изделия', 'изделий') : plural(n, 'модель', 'модели', 'моделей')) : 'Обсудить проект') + '</span>' + (LX ? LX.go('Открыть') : '<b>Открыть →</b>') + '</div></a>';
    }).join('') + '</div>' + (CAT.granite ? '<p class="note">' + esc(CAT.granite) + '</p>' : '');
    lxDone(); themes();
  }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }

  function kitHtml(c, m) {
    var h = '', pr = m ? itemPrice(m, c) : (c.price != null && c.price !== '' ? price(c) : '');
    if (pr) h += '<div class="prl"><span>Стоимость</span><b>' + pr + '</b></div>';
    if (m && m.size) h += '<ul class="kit"><li><b>Размер</b><span>' + esc(m.size) + '</span></li></ul>';
    if (isAddon(c)) return h + '<ul class="kit"><li><b>Материал</b><span>гранит, полировка</span></li><li><b>Цвет</b><span>в тон памятника</span></li></ul>';
    var sharedSize = CAT.sameSizeAll ? String(CAT.commonSize || '').trim() : '';
    if (c.kit && c.kit.length) {
      h += '<ul class="kit">' + c.kit.map(function (k) {
        var value = k[1] || '';
        if (sharedSize && c.useCommonKitSize === true && k[2] === true) value = sharedSize;
        return '<li><b>' + esc(k[0]) + '</b><span>' + esc(value) + '</span></li>';
      }).join('') + '</ul>';
    } else if (c.inc) {
      h += '<ul class="kit">' + c.inc.split(/,\s*/).map(function (k) { return '<li><b>' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + '</b></li>'; }).join('') + '</ul>';
    }
    return h;
  }

  function open(id) {
    var c = cats().filter(function (x) { return x.id === id; })[0];
    if (!c) return home();
    cur = c; list = items(c.id);
    title('Каталог · ' + esc(c.short || c.name), esc(c.name), '', '<a class="back" href="#">← Все разделы</a><a class="back" href="/" data-home>На главную</a>');
    if (!list.length) {
      box.innerHTML = '<div class="indiv glass"><h3>' + esc(c.name) + '</h3><p>' + esc(c.desc || '') + '</p>' +
        '<form class="form qcontact indform" id="indForm"><input required name="name" placeholder="Имя" autocomplete="name">' +
        '<input required name="phone" type="tel" placeholder="+375 (XX) XXX-XX-XX" autocomplete="tel">' +
        '<textarea name="c" rows="3" placeholder="Коротко опишите идею (необязательно)"></textarea>' +
        '<button class="btn btn-gold" type="submit">Обсудить проект <span class="arr">→</span></button>' +
        '<p class="muted">Перезвоним в рабочее время. Нажимая кнопку, вы соглашаетесь с политикой обработки персональных данных.</p></form>' +
        '<div class="ok" id="indOk">Спасибо! Перезвоним и обсудим ваш проект.</div></div>';
      bindInd(c); lxDone();
      return themes();
    }
    var addon = isAddon(c), ar = LX ? LX.stageAr(c.id) : 1;
    box.innerHTML = '<div class="cat-info"><div class="panel glass"><h3>О разделе</h3><p style="color:var(--mut)">' + esc(c.desc || '') + '</p>' +
      (CAT.granite && !addon ? '<p class="muted" style="margin-top:12px">' + esc(CAT.granite) + '</p>' : '') + '</div>' +
      '<div class="panel glass"><h3>' + (addon ? 'Стоимость' : 'В комплекте') + '</h3>' + kitHtml(c) + '</div></div>' +
      '<div class="mgrid lx-grid' + (addon ? ' addons' : '') + (ar > 1.2 ? ' wide' : '') + '" style="--lx-ar:' + ar.toFixed(4) + '">' + list.map(function (m, i) {
        var t = itemTitle(m, c), sub = addon ? itemPrice(m, c) : (c.short || '');
        return '<div class="mc glass lx" style="--d:' + ((i % 6) * 0.06).toFixed(2) + 's" data-i="' + i + '" role="button" tabindex="0" aria-label="' + esc(t) + '"><div class="im lx-stage' + (studio(m.img, m.studio) ? '' : ' raw') + '">' +
          imgTag(m.img, t, '(max-width:720px) 46vw, 240px', ' style="--z:' + ((c.cover && c.cover.zoomItems) || 1) + '"') + lxFrame(8) + '</div>' +
          '<div class="t"><b>' + esc(m.name || m.code) + '</b><span>' + esc(sub) + '</span></div></div>';
      }).join('') + '</div>';
    [].forEach.call(box.querySelectorAll('.mc'), function (el) {
      var go = function () { openBox(+el.dataset.i); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    lxDone(); themes();
  }

  function bindInd(c) {
    var f = $('#indForm'); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(f), btn = f.querySelector('button[type=submit]');
      var lead = { type: 'contact', name: fd.get('name'), phone: fd.get('phone'), comment: c.name + (fd.get('c') ? ': ' + fd.get('c') : ''), source: location.href };
      function done() { f.style.display = 'none'; $('#indOk').classList.add('on'); }
      if (window.PAMYAT_DEMO) return done();
      btn.disabled = true; btn.textContent = 'Отправляем…';
      fetch('/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lead) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return r.ok && d.ok ? done() : Promise.reject(d.error); }); })
        .catch(function (err) { btn.disabled = false; btn.innerHTML = 'Обсудить проект <span class="arr">→</span>'; alert(err || 'Не удалось отправить. Позвоните нам, пожалуйста.'); });
    });
  }

  /* ---------- три варианта камня: меняется только цвет гранита ---------- */
  var STONES = [
    { name: 'Габбро-диабаз', sw: '#1f1d1c' },
    { name: 'Серый гранит', sw: '#a6a49f', css: 'grayscale(1) brightness(2.5) contrast(.62)',
      p: { seed: 7, grain: 260, cell: 6, jit: 0.07, l0: 0.40, l1: 0.76, rgb: [1.02, 1.0, 0.975], cloud: 0.10, minerals: [[0.30, 0.80, 0.5], [1, 1.06, 0.8]], speck: [0.12, 0.42] } },
    { name: 'Красный гранит', sw: '#a4574b', css: 'sepia(1) saturate(2.4) hue-rotate(-22deg) brightness(1.7) contrast(.78)',
      p: { seed: 11, grain: 170, cell: 7, jit: 0.08, l0: 0.27, l1: 0.56, rgb: [1.5, 0.86, 0.75], cloud: 0.10, minerals: [[0.30, 0.77, 0.18], [1, 1.0, 0.95]], speck: [0.11, 0.4] } }
  ];
  var TCACHE = {}, WK = null, WQ = {}, WID = 0;
  function worker() {
    if (WK !== null) return WK;
    WK = false;
    try {
      if (!window.Worker || !window.Blob || !window.URL) return WK;
      var src = 'var C={};' + stoneTint.toString() + '\nonmessage=function(e){var m=e.data,a=new Uint8ClampedArray(m.buf),ok=stoneTint(a,m.w,m.h,m.p,C);postMessage({id:m.id,buf:m.buf,ok:ok},[m.buf])};';
      WK = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      WK.onmessage = function (e) { var cb = WQ[e.data.id]; delete WQ[e.data.id]; if (cb) cb(e.data.ok ? e.data.buf : null); };
      WK.onerror = function () { WK = false; Object.keys(WQ).forEach(function (k) { var cb = WQ[k]; delete WQ[k]; cb(null); }); };
    } catch (e) { WK = false; }
    return WK;
  }
  function tint(img, p, cb) { // img: ImageData
    var w = worker();
    if (w) {
      var id = ++WID, W = img.width, H = img.height;
      WQ[id] = function (buf) { cb(buf ? new ImageData(new Uint8ClampedArray(buf), W, H) : null); };
      try { w.postMessage({ id: id, buf: img.data.buffer, w: W, h: H, p: p }, [img.data.buffer]); return; } catch (e) { delete WQ[id]; WK = false; }
    }
    setTimeout(function () { var ok = false; try { ok = stoneTint(img.data, img.width, img.height, p, TCACHE); } catch (e) {} cb(ok ? img : null); }, 0);
  }
  function loadImg(src, full, cb) {
    var im = new Image(), tried = false;
    im.decoding = 'async';
    if (/^https?:/i.test(src) && src.indexOf(location.origin) !== 0) im.crossOrigin = 'anonymous';
    im.onload = function () { cb(im); };
    im.onerror = function () { if (!tried && full && full !== src) { tried = true; im.src = full; } else cb(null); };
    im.src = src;
    return im;
  }
  function renderTint(im, p, max, cb) {
    var w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) return cb(null);
    var k = Math.min(1, max / Math.max(w, h)); w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    var cv = document.createElement('canvas'), cx, data; cv.width = w; cv.height = h;
    try { cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0, w, h); data = cx.getImageData(0, 0, w, h); } catch (e) { return cb(null); }
    tint(data, p, function (out) { if (!out) return cb(null); cx.putImageData(out, 0, 0); cb(cv); });
  }
  var LRU = [];
  function cacheGet(k) { for (var i = 0; i < LRU.length; i++) if (LRU[i][0] === k) return LRU[i][1]; return null; }
  function cachePut(k, v, max) { LRU = LRU.filter(function (e) { return e[0] !== k; }); LRU.unshift([k, v]); var lim = max || 10; if (LRU.length > lim) LRU.length = lim; }

  var PIC = $('#clbPic') || ($('#clbImg') && $('#clbImg').parentNode), TOK = 0, MAN = null, FOC = null;
  // размеры фото и точки «грань / основание / фактура» (variants.json от workflow) — карточка сразу получает верные пропорции
  try { fetch('/assets/catalog/variants.json' + (LX ? '?v=' + LX.V : '')).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { MAN = j && j.items || null; FOC = j && j.focus || null; if (FOC && $('#clb').classList.contains('on') && list[idx]) drawDetails(list[idx]); }).catch(function () {}); } catch (e) {}
  function codeOf(m) { var f = assetFile(m.img); return f ? f.replace(/\.webp$/, '') : ''; }
  function setAr(w, h) { if (PIC && w > 0 && h > 0) PIC.style.setProperty('--ar', (w / h).toFixed(4)); }
  function placeNav() {
    var b = $('#clb .box'), im = PIC && PIC.querySelector('.sv .im'); if (!b || !im) return;
    var rb = b.getBoundingClientRect(), ri = im.getBoundingClientRect();
    b.style.setProperty('--nv-y', Math.round(ri.top - rb.top + b.scrollTop + ri.height / 2) + 'px');
  }
  function paneMax() {
    var d = Math.min(window.devicePixelRatio || 1, 2), el = PIC && PIC.querySelector('.sv .im');
    var s = el ? Math.max(el.clientWidth, el.clientHeight) : 440;
    return Math.max(480, Math.min(1200, Math.round(s * d * 1.15)));
  }
  function drawStones(m, alt) {
    if (!PIC) return;
    var tok = ++TOK, md = sized(m.img, 'md');
    PIC.className = 'pic stones';
    PIC.innerHTML = STONES.map(function (s, v) {
      return '<button type="button" class="sv' + (v ? ' wait' : '') + '" data-v="' + v + '" aria-label="' + esc(s.name + ': увеличить фото') + '">' +
        '<span class="im"><img decoding="async" src="' + esc(md) + '" data-full="' + esc(fresh(m.img)) + '" alt="' + esc(alt + ' — ' + s.name) + '"' + (s.css ? ' style="filter:' + s.css + '"' : '') + '></span>' +
        '<span class="lb"><i style="background:' + s.sw + '"></i>' + s.name + '</span></button>';
    }).join('') + '<p class="sv-note">Цвет камня показан для сравнения; рисунок гранита у каждой плиты свой. Нажмите на фото, чтобы рассмотреть в 4K.</p>';
    var wh = MAN && MAN[codeOf(m)]; if (wh) setAr(wh[0], wh[1]);
    requestAnimationFrame(placeNav);
    loadImg(md, m.img, function (im) {
      if (tok !== TOK) return;
      if (im) { setAr(im.naturalWidth, im.naturalHeight); requestAnimationFrame(placeNav); }
      var max = paneMax();
      STONES.forEach(function (s, v) {
        if (!v) return;
        var key = m.img + '|' + v + '|' + max;
        var done = function (cv) {
          if (tok !== TOK) return;
          var b = PIC.querySelector('.sv[data-v="' + v + '"]'); if (!b) return;
          b.classList.remove('wait');
          if (!cv) return; // остаётся CSS-фильтр
          var holder = b.querySelector('.im'), old = holder.querySelector('img');
          var view = document.createElement('canvas'); view.width = cv.width; view.height = cv.height; view.getContext('2d').drawImage(cv, 0, 0);
          view.setAttribute('role', 'img'); view.setAttribute('aria-label', old ? old.alt : s.name);
          holder.appendChild(view); if (old) holder.removeChild(old);
        };
        var hit = cacheGet(key); if (hit) return done(hit);
        if (!im) return done(null);
        renderTint(im, s.p, max, function (cv) { if (cv) cachePut(key, cv); done(cv); });
      });
    });
  }

  // одно фото на студийном фоне: рамка повторяет пропорции снимка, белый фон фото растворяется в подложке
  function drawSingle(m, alt) {
    if (!PIC) return;
    ++TOK;
    var md = sized(m.img, 'md'), wh = MAN && MAN[codeOf(m)], set = '';
    if (wh && md !== m.img) {
      var mw = Math.round(wh[0] * 1600 / Math.max(wh[0], wh[1]));
      set = ' srcset="' + esc(md) + ' ' + mw + 'w, ' + esc(fresh(m.img)) + ' ' + wh[0] + 'w" sizes="(max-width:720px) 100vw, 1080px"';
    }
    PIC.className = 'pic single';
    PIC.innerHTML = '<button type="button" class="sv one" data-v="0" aria-label="' + esc(alt + ': увеличить фото') + '">' +
      '<span class="im"><img decoding="async" src="' + esc(md) + '"' + set + ' data-full="' + esc(fresh(m.img)) + '" alt="' + esc(alt) + '"></span>' +
      '<span class="zh" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m15.2 15.2 4.6 4.6M10.5 7.8v5.4M7.8 10.5h5.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>4K</span></button>' +
      '<p class="sv-note">Нажмите на фото, чтобы рассмотреть его крупно в 4K.</p>';
    if (wh) setAr(wh[0], wh[1]);
    var im = PIC.querySelector('.sv .im img');
    var fit = function () { if (im.naturalWidth) setAr(im.naturalWidth, im.naturalHeight); requestAnimationFrame(placeNav); };
    if (im.complete) fit(); else im.addEventListener('load', fit, { once: true });
    requestAnimationFrame(placeNav);
  }

  /* ---------- крупный просмотр (4K) ---------- */
  var Z = null, ZTOK = 0, ZV = 0, HI = null, ZC = [], ZF = null;
  var HI_MAX = COARSE || (navigator.deviceMemory && navigator.deviceMemory <= 4) ? 2400 : 3840;
  function zoomEl() {
    if (Z) return Z;
    Z = document.createElement('div'); Z.className = 'czoom'; Z.setAttribute('role', 'dialog'); Z.setAttribute('aria-modal', 'true'); Z.setAttribute('aria-label', 'Фото крупно');
    Z.setAttribute('data-lenis-prevent', '');
    Z.innerHTML = '<div class="zs"></div><div class="zbar"><div class="zt"></div><div class="zvs">' + STONES.map(function (s, v) {
      return '<button type="button" data-zv="' + v + '"><i style="background:' + s.sw + '"></i><span>' + s.name + '</span></button>';
    }).join('') + '</div><button type="button" class="zx" aria-label="Закрыть"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div><div class="zl" aria-live="polite"></div>';
    document.body.appendChild(Z);
    var zs = $('.zs', Z), drag = null;
    $('.zx', Z).addEventListener('click', closeZoom);
    [].forEach.call(Z.querySelectorAll('[data-zv]'), function (b) { b.addEventListener('click', function () { zoomVariant(+b.dataset.zv); }); });
    zs.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || !zs.classList.contains('zoomed')) return;
      drag = { x: e.clientX, y: e.clientY, l: zs.scrollLeft, t: zs.scrollTop, moved: false };
    });
    zs.addEventListener('pointermove', function (e) {
      if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      zs.scrollLeft = drag.l - dx; zs.scrollTop = drag.t - dy;
    });
    addEventListener('pointerup', function () { if (drag && !drag.moved) drag = null; });
    zs.addEventListener('click', function (e) {
      if (drag && drag.moved) { drag = null; return; } drag = null;
      var md = zs.firstChild; if (!md) return;
      ZF = null;
      if (zs.classList.contains('zoomed')) { zs.classList.remove('zoomed'); md.style.width = md.style.height = ''; return; }
      if (e.target !== md) return closeZoom();
      var r = md.getBoundingClientRect(), nw = md.naturalWidth || md.width, nh = md.naturalHeight || md.height;
      var s = Math.min(r.width / nw, r.height / nh), cw = nw * s, ch = nh * s, cl = r.left + (r.width - cw) / 2, ct = r.top + (r.height - ch) / 2;
      var fx = (e.clientX - cl) / cw, fy = (e.clientY - ct) / ch;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return closeZoom();
      zoomTo(md, fx, fy, e.clientX, e.clientY);
    });
    return Z;
  }
  // приблизить фото так, чтобы точка (fx, fy) в долях кадра оказалась под (px, py) — по умолчанию в центре экрана
  function zoomTo(md, fx, fy, px, py) {
    var zs = $('.zs', Z), r = md.getBoundingClientRect(), nw = md.naturalWidth || md.width, nh = md.naturalHeight || md.height;
    if (!nw || !nh || !r.width) return false;
    var s = Math.min(r.width / nw, r.height / nh), cw = nw * s, ch = nh * s;
    var k = Math.max(2, Math.min(3.2, nw / cw)), zr = zs.getBoundingClientRect();
    if (px == null) { px = zr.left + zr.width / 2; py = zr.top + zr.height / 2; }
    zs.classList.add('zoomed'); md.style.width = Math.round(cw * k) + 'px'; md.style.height = Math.round(ch * k) + 'px';
    var ox = Math.max(0, (zs.clientWidth - cw * k) / 2); // узкое фото центрируется (margin:auto)
    zs.scrollLeft = fx * cw * k + ox - (px - zr.left); zs.scrollTop = fy * ch * k - (py - zr.top);
    return true;
  }
  function zoomLoading(on) { var l = Z && $('.zl', Z); if (l) { l.textContent = on ? 'Загружаем 4K…' : ''; l.classList.toggle('on', !!on); } }
  function zoomSwap(el, final) {
    var zs = $('.zs', Z); el.classList.add('zm'); el.draggable = false;
    zs.classList.remove('zoomed'); zs.innerHTML = ''; zs.appendChild(el); zoomLoading(false);
    // переход из линзы «Детали»: сразу приближаем к той же точке (и ещё раз — когда пришло 4K)
    var f = ZF; if (!f) return;
    if (final) ZF = null;
    var go = function () { requestAnimationFrame(function () { if (el.parentNode === zs) zoomTo(el, f[0], f[1]); }); };
    if (el.tagName === 'IMG' && !el.complete) el.addEventListener('load', go, { once: true }); else go();
  }
  function getHi(m, cb) {
    // HI.cbs !== null — загрузка ещё идёт; после ошибки запись сбрасывается, и следующий вызов грузит 4K заново
    if (HI && HI.u === m.img && (HI.im || HI.cbs)) { if (HI.im) return cb(HI.im); HI.cbs.push(cb); return; }
    var h = HI = { u: m.img, im: null, cbs: [cb] };
    loadImg(fresh(m.img), '', function (im) {
      var l = h.cbs; h.cbs = null; h.im = im || null;
      if (HI !== h) return;
      if (!im) HI = null;
      l.forEach(function (f) { f(h.im); });
    });
  }
  function zoomVariant(v) {
    var m = list[idx]; if (!m) return;
    var one = !multiStone(cur); if (one) v = 0;
    var tok = ++ZTOK, s = STONES[v], cap = itemTitle(m, cur) + (one ? '' : ' — ' + s.name); ZV = v;
    Z.classList.toggle('single', one);
    [].forEach.call(Z.querySelectorAll('[data-zv]'), function (b) { b.setAttribute('aria-pressed', +b.dataset.zv === v ? 'true' : 'false'); });
    $('.zt', Z).textContent = itemTitle(m, cur) + (one ? '' : ' · ' + s.name);
    var pane = PIC && PIC.querySelector('.sv[data-v="' + v + '"] .im > *'), ph;
    if (pane && pane.tagName === 'CANVAS') { ph = document.createElement('canvas'); ph.width = pane.width; ph.height = pane.height; ph.getContext('2d').drawImage(pane, 0, 0); }
    else { ph = new Image(); ph.src = sized(m.img, 'md'); ph.alt = ''; if (s.css) ph.style.filter = s.css; }
    zoomSwap(ph); zoomLoading(true);
    var key = m.img + '|' + v + '|z';
    getHi(m, function (im) {
      if (tok !== ZTOK) return;
      if (!im) { ZF = null; return zoomLoading(false); }
      if (!v) { var o = im.cloneNode(); o.alt = cap; return zoomSwap(o, true); }
      for (var i = 0; i < ZC.length; i++) if (ZC[i][0] === key) return zoomSwap(ZC[i][1], true);
      renderTint(im, s.p, HI_MAX, function (cv) {
        if (!cv) { if (tok === ZTOK) zoomLoading(false); return; }
        cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', cap);
        ZC.unshift([key, cv]); if (ZC.length > 2) ZC.length = 2;
        if (tok === ZTOK) zoomSwap(cv, true);
      });
    });
  }
  function openZoom(v, at) { zoomEl().classList.add('on'); ZF = at || null; zoomVariant(v); var x = $('.zx', Z); if (x) x.focus({ preventScroll: true }); }
  // дополнительное фото модели (админка → «Доп. фото»): только просмотр, без вариантов камня
  function openPhoto(u, cap) {
    zoomEl().classList.add('on'); Z.classList.add('single'); ZF = null;
    var tok = ++ZTOK; $('.zt', Z).textContent = cap;
    var ph = new Image(); ph.src = sized(u, 'md'); ph.alt = cap; zoomSwap(ph); zoomLoading(true);
    loadImg(fresh(u), '', function (im) { if (tok !== ZTOK) return; zoomLoading(false); if (im) { var o = im.cloneNode(); o.alt = cap; zoomSwap(o, true); } });
    var x = $('.zx', Z); if (x) x.focus({ preventScroll: true });
  }
  function closeZoom() { if (!Z) return; ZTOK++; ZF = null; Z.classList.remove('on'); var zs = $('.zs', Z); zs.innerHTML = ''; zoomLoading(false); }
  function zoomOn() { return !!(Z && Z.classList.contains('on')); }
  if (PIC) PIC.addEventListener('click', function (e) { var b = e.target.closest('.sv'); if (b) openZoom(+b.dataset.v); });

  /* ---------- «Детали»: линзы «грань и угол», «основание», «фактура камня» + доп. фото ---------- */
  var DTOK = 0, LZ = 6.5;
  function drawDetails(m) {
    var host = $('#clbDet'); if (!host) return;
    var tok = ++DTOK, md = sized(m.img, 'md'), c = codeOf(m), t = itemTitle(m, cur);
    var photos = (Array.isArray(m.photos) ? m.photos : []).filter(function (u) { return typeof u === 'string' && u; }).slice(0, 12);
    host.innerHTML = '';
    if (!LX) return;
    var put = function (pts, ar) {
      if (tok !== DTOK) return;
      if (!pts && !photos.length) { host.innerHTML = ''; return; }
      host.innerHTML = '<div class="lx-det">' + (pts ? '<h4>Детали</h4><div class="lx-lens">' + pts.map(function (p, i) {
        var L = LX.lens(LX.aim(p.key, p.f, LZ, ar), LZ, ar);
        return '<button type="button" data-lens="' + i + '" aria-label="' + esc(p.label + ': рассмотреть в 4K') + '"><span class="o" style="background-image:url(&quot;' + esc(md) + '&quot;);background-size:' + L.size + ';background-position:' + L.pos + '"></span>' + esc(p.label) + '</button>';
      }).join('') + '</div>' : '') +
        (photos.length ? (pts ? '' : '<h4>Фото</h4>') + '<div class="lx-more">' + photos.map(function (u, i) {
          return '<button type="button" data-photo="' + i + '" aria-label="' + esc(t + ': дополнительное фото ' + (i + 1)) + '"><img loading="lazy" decoding="async" src="' + esc(sized(u, 'sm')) + '" alt=""></button>';
        }).join('') + '</div>' : '') + '</div>';
      [].forEach.call(host.querySelectorAll('[data-lens]'), function (b) {
        b.addEventListener('click', function () { var p = pts[+b.dataset.lens]; openZoom(0, LX.lensCenter(LX.aim(p.key, p.f, LZ, ar), LZ, ar)); });
      });
      [].forEach.call(host.querySelectorAll('[data-photo]'), function (b) {
        b.addEventListener('click', function () { openPhoto(photos[+b.dataset.photo], t + ' · фото ' + (+b.dataset.photo + 1)); });
      });
    };
    var wh = MAN && MAN[c], known = LX.focusList(m.focus) || (FOC && LX.focusList(FOC[c]));
    if (known && wh) return put(known, wh[0] / wh[1]);
    // нет готовых точек (фото загружено в админке) — находим изделие на уменьшенной копии
    loadImg(md, m.img, function (im) {
      if (tok !== DTOK) return;
      if (!im) return put(null, 1);
      var ar = im.naturalWidth / im.naturalHeight;
      if (known) return put(known, ar);
      var pts = null;
      try {
        var k = 160 / Math.max(im.naturalWidth, im.naturalHeight), w = Math.max(8, Math.round(im.naturalWidth * k)), h = Math.max(8, Math.round(im.naturalHeight * k));
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0, w, h);
        pts = LX.focusList(LX.focusFromPixels(cx.getImageData(0, 0, w, h).data, w, h));
      } catch (e) { pts = null; }
      put(pts, ar);
    });
  }

  /* ---------- карточка модели ---------- */
  function calcHref(m) { return '/?model=' + encodeURIComponent(m.code) + '&cat=' + encodeURIComponent(cur.id) + '#calc'; }
  var lastFocus = null;
  function openBox(i) {
    lastFocus = document.activeElement;
    show(i); $('#clb').classList.add('on');
    if (window.PAMYAT_LENIS) try { window.PAMYAT_LENIS.stop(); } catch (e) {}
    var x = $('#clbX'); if (x) x.focus({ preventScroll: true });
  }
  function show(i) {
    idx = (i + list.length) % list.length;
    var m = list[idx], addon = isAddon(cur), t = itemTitle(m, cur);
    $('#clbK').textContent = cur.name + (list.length > 1 ? ' · ' + (idx + 1) + ' из ' + list.length : '');
    $('#clbT').textContent = t;
    $('#clbD').innerHTML = kitHtml(cur, m);
    $('#clbG').textContent = addon ? 'Изготовим из того же гранита, что и памятник: чёрного, серого или красного.' : (CAT.granite || '');
    var a = $('#clbCalc'), sec = $('#clb .acts .btn-line');
    if (addon) {
      a.href = '/#contact'; a.innerHTML = (m.price == null ? 'Узнать цену' : 'Заказать') + ' <span class="arr">→</span>';
      if (sec) { sec.href = '/#calc'; sec.textContent = 'Рассчитать памятник'; }
    } else {
      a.href = calcHref(m); a.innerHTML = 'Рассчитать стоимость <span class="arr">→</span>';
      if (sec) { sec.href = '/#contact'; sec.textContent = 'Консультация'; }
    }
    if (multiStone(cur)) drawStones(m, t); else drawSingle(m, t);
    drawDetails(m);
    var nx = list[(idx + 1) % list.length]; if (nx && nx !== m) { var pre = new Image(); pre.decoding = 'async'; pre.src = sized(nx.img, 'md'); }
  }
  $('#clbCalc').addEventListener('click', function (e) {
    if (window.parent !== window && cur && list[idx] && !isAddon(cur)) { e.preventDefault(); window.parent.postMessage({ pamyatModel: list[idx].code, cat: cur.id }, '*'); }
  });
  function close() {
    closeZoom(); $('#clb').classList.remove('on'); TOK++;
    if (window.PAMYAT_LENIS) try { window.PAMYAT_LENIS.start(); } catch (e) {}
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }
  var rzT = 0;
  window.addEventListener('resize', function () {
    if (!$('#clb').classList.contains('on')) return;
    clearTimeout(rzT); rzT = setTimeout(placeNav, 120);
  }, { passive: true });
  $('#clb').setAttribute('data-lenis-prevent', '');
  $('#clbX').onclick = close; $('#clbP').onclick = function () { show(idx - 1); }; $('#clbN').onclick = function () { show(idx + 1); };
  $('#clb').addEventListener('click', function (e) { if (e.target === this) close(); });
  document.addEventListener('keydown', function (e) {
    if (zoomOn()) {
      if (e.key === 'Escape') { e.preventDefault(); closeZoom(); }
      if (!multiStone(cur)) return;
      if (e.key === 'ArrowLeft') zoomVariant((ZV + STONES.length - 1) % STONES.length);
      if (e.key === 'ArrowRight') zoomVariant((ZV + 1) % STONES.length);
      return;
    }
    if (!$('#clb').classList.contains('on')) return;
    if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1);
  });

  document.addEventListener('click', function (e) {
    if (window.parent === window) return;
    var a = e.target.closest('[data-home], a[href^="/#"]'); if (!a || (a.id === 'clbCalc' && !isAddon(cur))) return;
    e.preventDefault(); var h = a.getAttribute('href') || '';
    window.parent.postMessage({ pamyatClose: true, go: h.indexOf('#') > -1 ? h.slice(h.indexOf('#')) : '' }, '*');
  });
  function route() { if ($('#clb').classList.contains('on')) close(); var id = location.hash.slice(1); id ? open(id) : home(); scrollTo(0, 0); }
  addEventListener('hashchange', route);
  document.addEventListener('pamyat:catalog', function (e) { CAT = e.detail; route(); });
  route();

  /* перекраска чёрного гранита (габбро-диабаза) в другой камень: тёмные малонасыщенные пиксели → новый тон + зерно гранита, блики и фон сохраняются */
  /* stone tint kernel: recolors dark low-chroma (black granite) pixels to another granite.
     d: RGBA Uint8ClampedArray (modified in place), w,h: size, p: variant params */
  function stoneTint(d, w, h, p, cache) {
    var n = w * h, i, o, r, g, b, mx, mn, L, c;
    var hist = new Uint32Array(256), cnt = 0;
    for (i = 0; i < n; i++) {
      o = i << 2; r = d[o]; g = d[o + 1]; b = d[o + 2];
      mx = r > g ? (r > b ? r : b) : (g > b ? g : b); mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      if (mx < 150 && mx - mn < 30) { hist[(r * 54 + g * 183 + b * 19) >> 8]++; cnt++; }
    }
    if (cnt < 50) return false;
    var lo = 0, hi = 140, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cnt * 0.02) { lo = i; break; } }
    for (acc = 0, i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= cnt * 0.04) { hi = i; break; } }
    if (hi - lo < 12) hi = lo + 12;
    // студийное фото: светлый фон и мягкая тень, связанные с краем кадра, не перекрашиваем (иначе тень «краснеет»),
    // белый мрамор и блики на краю изделия тоже остаются как есть
    var bgm = new Uint8Array(n), stk = new Int32Array(n), sp = 0, TB = 150, q0, qx;
    var lit = function (k) { var u = k << 2; return (d[u] * 54 + d[u + 1] * 183 + d[u + 2] * 19) >> 8 >= TB; };
    var push = function (k) { if (!bgm[k] && lit(k)) { bgm[k] = 1; stk[sp++] = k; } };
    for (i = 0; i < w; i++) { push(i); push((h - 1) * w + i); }
    for (i = 1; i < h - 1; i++) { push(i * w); push(i * w + w - 1); }
    while (sp) { q0 = stk[--sp]; qx = q0 % w; if (qx > 0) push(q0 - 1); if (qx < w - 1) push(q0 + 1); if (q0 >= w) push(q0 - w); if (q0 < n - w) push(q0 + w); }
    stk = null;
    // granite tiles: periodic Voronoi crystals (minerals) + biotite specks
    var N = 512, M = N - 1, seed = p.seed | 0;
    function hs(x, y) { var q = (x * 374761393 + y * 668265263 + seed * 2147483 + 1013904223) | 0; q = Math.imul(q ^ (q >>> 13), 1274126177); q ^= q >>> 16; return (q >>> 0) / 4294967296; }
    function tile(cell, fn) {
      var per = Math.round(N / cell), cs = N / per, out = new Float32Array(N * N), x, y, dx, dy;
      for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
        var cx = Math.floor(x / cs), cy = Math.floor(y / cs), best = 1e9, bx = 0, by = 0, d2 = 1e9;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          var ux = cx + dx, uy = cy + dy, gx = (ux + per) % per, gy = (uy + per) % per;
          var fx = (ux + 0.15 + 0.7 * hs(gx, gy)) * cs - x, fy = (uy + 0.15 + 0.7 * hs(gy + 71, gx + 13)) * cs - y, dd = fx * fx + fy * fy;
          if (dd < best) { d2 = best; best = dd; bx = gx; by = gy; } else if (dd < d2) d2 = dd;
        }
        out[y * N + x] = fn(hs(bx + 191, by + 7), hs(by + 3, bx + 501), Math.sqrt(d2) - Math.sqrt(best));
      }
      return out;
    }
    var key = 't' + seed + '_' + p.cell, TT = cache && cache[key];
    if (!TT) {
      var Al = new Float32Array(N * N), Ac = new Float32Array(N * N), mi = p.minerals;
      var A = tile(p.cell, function (u, j, e) {
        var k; for (k = 0; k < mi.length; k++) if (u < mi[k][0]) break; k = Math.min(k, mi.length - 1);
        return k + 0.5 * (1 - p.jit + 2 * p.jit * j) * (e < 0.7 ? 0.9 + 0.1 * e / 0.7 : 1) / 1.2;
      });
      for (i = 0; i < N * N; i++) { var kq = Math.floor(A[i]), jq = (A[i] - kq) * 2.4; Al[i] = mi[kq][1] * jq; Ac[i] = mi[kq][2]; }
      var Bl = tile(p.cell * 0.6, function (u) { return u < p.speck[0] ? p.speck[1] : 1; });
      var cl = new Float32Array(N * N);
      (function () { var s = 64, per = N / s, x, y; for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
        var fx = x / s, fy = y / s, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var a = hs(x0 + 900, y0), b2 = hs(x1 + 900, y0), c2 = hs(x0 + 900, y1), d3 = hs(x1 + 900, y1);
        cl[y * N + x] = 1 + p.cloud * (a + (b2 - a) * tx + (c2 - a) * ty + (a - b2 - c2 + d3) * tx * ty - 0.5);
      } })();
      TT = { Al: Al, Ac: Ac, Bl: Bl, cl: cl }; if (cache) cache[key] = TT;
    }
    var Al = TT.Al, Ac = TT.Ac, Bl = TT.Bl, cl = TT.cl;
    var sc = p.cell * p.grain / Math.max(w, h), smooth = sc < 0.9,
      l0 = p.l0, l1 = p.l1, br = p.rgb[0], bg = p.rgb[1], bb = p.rgb[2], inv = 1 / (hi - lo), sLum = hi / 255;
    for (var yy = 0; yy < h; yy++) {
      var fy = yy * sc;
      for (var xx = 0; xx < w; xx++) {
        if (bgm[yy * w + xx]) continue;
        o = (yy * w + xx) << 2; r = d[o]; g = d[o + 1]; b = d[o + 2];
        mx = r > g ? (r > b ? r : b) : (g > b ? g : b); mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
        if (mx > 236) continue;
        c = mx - mn; L = (r * 54 + g * 183 + b * 19) >> 8;
        var c0 = (b >= r && b >= g) ? 70 : 26, mc = c < c0 ? 1 : c > c0 * 2 ? 0 : 1 - (c - c0) / c0; if (!mc) continue;
        var ml = L < 180 ? 1 : L > 228 ? 0 : 1 - (L - 180) / 48, m = mc * ml; if (m <= 0) continue;
        var lf = L / 255, al = lf <= sLum ? 1 : (1 - lf) / (1 - sLum);
        var t = (L - lo) * inv; t = t < 0 ? 0 : t > 1 ? 1 : t;
        var tl = l0 + (l1 - l0) * t, fx = xx * sc, lmA, chA, lmB, cv = cl[((fy * 0.5 | 0) & M) * N + ((fx * 0.5 | 0) & M)];
        if (smooth) {
          var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, x1 = (x0 + 1) & M, y1 = (y0 + 1) & M; x0 &= M; y0 &= M;
          var i00 = y0 * N + x0, i10 = y0 * N + x1, i01 = y1 * N + x0, i11 = y1 * N + x1, w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          lmA = Al[i00] * w00 + Al[i10] * w10 + Al[i01] * w01 + Al[i11] * w11;
          chA = Ac[i00] * w00 + Ac[i10] * w10 + Ac[i01] * w01 + Ac[i11] * w11;
          var gx = fy * 1.37 + 211, gy = fx * 1.37 + 97, u0 = Math.floor(gx), v0 = Math.floor(gy), sx = gx - u0, sy = gy - v0, u1 = (u0 + 1) & M, v1 = (v0 + 1) & M; u0 &= M; v0 &= M;
          lmB = Bl[v0 * N + u0] * (1 - sx) * (1 - sy) + Bl[v0 * N + u1] * sx * (1 - sy) + Bl[v1 * N + u0] * (1 - sx) * sy + Bl[v1 * N + u1] * sx * sy;
        } else {
          var ia = ((fy | 0) & M) * N + ((fx | 0) & M); lmA = Al[ia]; chA = Ac[ia];
          lmB = Bl[(((fx * 1.37 + 97) | 0) & M) * N + (((fy * 1.37 + 211) | 0) & M)];
        }
        var f = lmA * lmB * cv, kk = chA * (lmB < 1 ? 0.4 : 1) * al;
        if (al < 0.55) { var q = al < 0.14 ? 0 : (al - 0.14) / 0.41; m *= q * q * (3 - 2 * q); if (m <= 0) continue; }
        var ff = 1 + (f - 1) * al * al * al, lum = tl * ff * 255;
        var nr = lum * (1 + kk * (br - 1)), ng = lum * (1 + kk * (bg - 1)), nb = lum * (1 + kk * (bb - 1));
        nr = al * nr + (1 - al) * 255; ng = al * ng + (1 - al) * 255; nb = al * nb + (1 - al) * 255;
        d[o] = r + (nr - r) * m; d[o + 1] = g + (ng - g) * m; d[o + 2] = b + (nb - b) * m;
      }
    }
    return true;
  }
})();
