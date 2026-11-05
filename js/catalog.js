/* ПАМЯТЬ.БАЙ — каталог: разделы, модели, карточка модели. Данные — из админки.
   3D-модели в 5 гранитах (js/catalog-3d.js), группы-чипсы, скидки и бейджи (js/catalog-x.js). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var box = $('#catBox'); if (!box) return;
  var CAT = window.PAMYAT_CATALOG || window.PAMYAT_CATALOG_DEFAULT || { categories: [], items: [] };
  var cur = null, list = [], idx = 0;
  var COARSE = window.matchMedia && matchMedia('(pointer:coarse)').matches;
  var LX = window.PamyatLux || null; // js/catalog-lux.js: студийные фото, золотые рамки, лупа «Детали»
  var R3 = window.Pamyat3D || null; // js/catalog-3d.js: 3D-рендеры моделей в 5 гранитах, смена камня при наведении
  var R3K = -1; // гранит для карточки модели: ≥0 — выбран на карточке в сетке, -1 — как у открытой модели (листание стрелками)
  var X = window.PamyatCatX || null; // js/catalog-x.js: группы, скидки, бейджи, 3D на обложке
  var GRP = {}; // выбранная группа (чипс) в разделе
  if (R3) { R3.prefs(CAT); R3.load(); }
  function fmt(n) { return Number(n).toLocaleString('ru-RU'); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function cats() { return (CAT.categories || []).filter(function (c) { return c.visible !== false; }); }
  function items(id) { return (CAT.items || []).filter(function (x) { return x.cat === id; }); }
  function pctOf(m, c) { return X ? X.pct(m, c) : 0; }
  function priceFrom(p, pc) { return X ? X.priceHtml(p, pc, fmt) : 'от ' + fmt(p) + ' BYN'; }
  function price(c) { return c.price == null || c.price === '' ? 'Индивидуальный расчёт' : priceFrom(c.price, pctOf(null, c)); }
  function hasOwnPrice(m) { return m && Object.prototype.hasOwnProperty.call(m, 'price'); }
  function itemPrice(m, c) {
    if (!hasOwnPrice(m)) return c && c.price != null && c.price !== '' ? priceFrom(c.price, pctOf(m, c)) : ''; // цена раздела, скидка — своя у модели или раздела
    return m.price == null || m.price === '' ? 'Цена по запросу' : priceFrom(m.price, pctOf(m, c));
  }
  function badgeOf(o, pc, cls) { return X ? X.badgeHtml(X.badge(o, pc), cls) : ''; }
  function groupMat(m, c) { var g = X && m ? X.groupOf(m, c) : ''; if (!g) return ''; var o = X.groups(c).filter(function (x) { return x.id === g; })[0]; return o && o.material || ''; }
  function isAddon(c) { return !!c && (c.id === 'accessories' || c.calc === false); }
  // 3D в 5 гранитах: вертикальные, горизонтальные, кресты, ограды; комплексы и аксессуары — одно фото (в админке можно задать stones: true/false)
  function multiStone(c) { return X ? X.r3ok(c) : !!c && (c.stones === true || (c.stones !== false && c.id !== 'complex' && !isAddon(c))); }
  function has3d(c, m) { return !!(R3 && multiStone(c) && (m ? R3.codeOf(m.img) : items(c.id).some(function (x) { return R3.codeOf(x.img); }))); }
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
    var cv = c.cover || {}, bd = badgeOf(c, pctOf(null, c), 'cx-cov');
    // обложка в 3D: курсор по фото меняет гранит (как у моделей)
    var r3 = R3 && X ? X.coverCode(c, R3) : '';
    if (r3) return '<div class="cover lx-stage r3s" data-r3="' + esc(r3) + '">' + R3.stage(r3, c.name, '(max-width:720px) 92vw, 400px', false, c.id) + lxFrame(10) + bd + '</div>';
    // «По вашему эскизу»: линейный эскиз стелы вместо символа ✦ (на части устройств он был пустым квадратом)
    if (!cv.img) return '<div class="cover lx-stage ind">' + (LX ? LX.sketch() : '') + '<span>По вашему эскизу</span>' + (LX ? LX.frame(10) : '') + bd + '</div>';
    var s = LX ? LX.cover(cv) : { img: cv.img, zoom: cv.zoom || 1, pos: cv.pos || '', studio: false };
    return '<div class="cover lx-stage' + (s.studio ? '' : ' raw') + '">' + imgTag(s.img, c.name, '(max-width:720px) 92vw, 400px', ' style="--z:' + s.zoom + ';--pos:' + esc(s.pos || '50% 50%') + '"') + lxFrame(10) + bd + '</div>';
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
    if (R3 && box.querySelector('[data-r3]')) R3.bind(box);
    lxDone(); themes();
  }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }

  function kitHtml(c, m) {
    var h = '', pr = m ? itemPrice(m, c) : (c.price != null && c.price !== '' ? price(c) : '');
    if (pr) h += '<div class="prl"><span>Стоимость</span><b>' + pr + '</b></div>';
    if (m && m.size) h += '<ul class="kit"><li><b>Размер</b><span>' + esc(m.size) + '</span></li></ul>';
    if (isAddon(c)) {
      // 3D-модели (ограды) — в любом из гранитов; аксессуары — из чёрного габбро-диабаза или материала группы (бронза)
      var mat = groupMat(m, c), any3d = has3d(c, m);
      return h + '<ul class="kit"><li><b>Материал</b><span>' + esc(mat || 'гранит, полировка') + '</span></li>' + (mat || any3d ? '' : '<li><b>Цвет</b><span>чёрный (габбро-диабаз)</span></li>') + '</ul>';
    }
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

  function open(id, keepScroll) {
    var c = cats().filter(function (x) { return x.id === id; })[0];
    if (!c) return home();
    var all = items(c.id), gs = X ? X.usedGroups(c, all) : [], g = GRP[c.id] || '';
    if (g && !gs.some(function (x) { return x.id === g; })) g = GRP[c.id] = '';
    cur = c; list = X ? X.inGroup(all, c, g) : all;
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
    // 3D-модели: квадратный кадр, как у рендеров; позиции со своим фото из админки остаются фото
    var r3 = list.map(function (m) { return R3 && multiStone(c) ? R3.codeOf(m.img) : ''; }), r3n = r3.filter(Boolean).length;
    if (r3n) ar = 1;
    // группы (чипсы): «Все» и группы, в которых есть позиции
    var chips = gs.length ? '<div class="cx-chips" role="group" aria-label="Группы раздела">' + [{ id: '', name: 'Все', n: all.length }].concat(gs).map(function (x) {
      return '<button type="button" data-g="' + esc(x.id) + '" aria-pressed="' + (x.id === g ? 'true' : 'false') + '">' + esc(x.name) + '<i>' + x.n + '</i></button>';
    }).join('') + '</div>' : '';
    box.innerHTML = '<div class="cat-info"><div class="panel glass"><h3>О разделе</h3><p style="color:var(--mut)">' + esc(c.desc || '') + '</p>' +
      (CAT.granite && !addon ? '<p class="muted" style="margin-top:12px">' + esc(CAT.granite) + '</p>' : '') + '</div>' +
      '<div class="panel glass"><h3>' + (addon ? 'Стоимость' : 'В комплекте') + '</h3>' + kitHtml(c) + '</div></div>' + chips +
      '<div class="mgrid lx-grid' + (addon ? ' addons' : '') + (ar > 1.2 ? ' wide' : '') + (r3n ? ' r3g' : '') + '" style="--lx-ar:' + ar.toFixed(4) + '">' + list.map(function (m, i) {
        var t = itemTitle(m, c), sub = addon ? itemPrice(m, c) : esc(c.short || ''), bd = badgeOf(m, pctOf(m, c));
        var head = '<div class="mc glass lx' + (r3[i] ? ' r3c' : '') + '" style="--d:' + ((i % 6) * 0.06).toFixed(2) + 's" data-i="' + i + '" role="button" tabindex="0" aria-label="' + esc(t) + '">';
        if (r3[i]) return head + '<div class="im lx-stage r3s" data-r3="' + r3[i] + '" data-r3-label="' + esc(t) + '">' + R3.stage(r3[i], t, '(max-width:720px) 46vw, 300px', false, c.id) + lxFrame(8) + bd + '</div>' +
          '<div class="t"><b>' + esc(m.name || m.code) + '</b>' + R3.dots(t + ': выбрать гранит', c.id) + '</div></div>';
        return head + '<div class="im lx-stage' + (studio(m.img, m.studio) ? '' : ' raw') + '">' +
          imgTag(m.img, t, '(max-width:720px) 46vw, 240px', ' style="--z:' + ((c.cover && c.cover.zoomItems) || 1) + '"') + lxFrame(8) + bd + '</div>' +
          '<div class="t"><b>' + esc(m.name || m.code) + '</b><span>' + sub + '</span></div></div>';
      }).join('') + '</div>';
    if (r3n) R3.bind(box);
    [].forEach.call(box.querySelectorAll('.cx-chips [data-g]'), function (b) {
      b.addEventListener('click', function () {
        GRP[c.id] = b.getAttribute('data-g');
        try { history.replaceState(null, '', '#' + c.id + (GRP[c.id] ? '/' + GRP[c.id] : '')); } catch (e) {}
        open(c.id, true);
      });
    });
    [].forEach.call(box.querySelectorAll('.mc'), function (el) {
      var go = function () { var st = R3 && el.querySelector('[data-r3]'); R3K = st ? R3.current(st) : 0; openBox(+el.dataset.i); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    lxDone(); themes();
    if (keepScroll) { var ch = box.querySelector('.cx-chips [aria-pressed=true]'); if (ch) try { ch.focus({ preventScroll: true }); } catch (e) {} }
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

  /* ---------- загрузка фото ---------- */
  function loadImg(src, full, cb) {
    var im = new Image(), tried = false;
    im.decoding = 'async';
    if (/^https?:/i.test(src) && src.indexOf(location.origin) !== 0) im.crossOrigin = 'anonymous';
    im.onload = function () { cb(im); };
    im.onerror = function () { if (!tried && full && full !== src) { tried = true; im.src = full; } else cb(null); };
    im.src = src;
    return im;
  }

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

  // 3D-модель: один кадр, гранит меняется курсором по фото или образцами под ним; по нажатию — крупно
  function draw3d(m, alt, code) {
    if (!PIC) return;
    ++TOK;
    var k = R3K, was = PIC.querySelector('[data-r3]'); R3K = -1;
    if (k < 0) k = was ? R3.current(was) : 0;
    PIC.className = 'pic single r3p';
    PIC.innerHTML = '<button type="button" class="sv one" data-v="0" aria-label="' + esc(alt + ': открыть крупно') + '">' +
      '<span class="im lx-stage r3s" data-r3="' + esc(code) + '" data-r3-label="' + esc(alt) + '">' + R3.stage(code, alt, '(max-width:720px) 92vw, 560px', true, cur.id) + '</span>' +
      '<span class="zh" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" focusable="false"><circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m15.2 15.2 4.6 4.6M10.5 7.8v5.4M7.8 10.5h5.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>Крупно</span></button>' +
      R3.swatches(cur.id) + '<p class="sv-note">' + (R3.variants(cur.id).length < 2 ? 'Нажмите на фото, чтобы рассмотреть модель крупно' : (COARSE ? 'Выберите гранит под фото' : 'Ведите курсор по фото — меняется гранит') + '. Рисунок камня у каждой плиты свой') + '.</p>';
    setAr(1, 1);
    R3.bind(PIC);
    var st = PIC.querySelector('[data-r3]'); if (k && st) R3.show(st, k, true);
    requestAnimationFrame(placeNav);
  }

  /* ---------- крупный просмотр (4K) ---------- */
  var Z = null, ZTOK = 0, ZV = 0, HI = null, ZF = null;
  function zoomEl() {
    if (Z) return Z;
    Z = document.createElement('div'); Z.className = 'czoom'; Z.setAttribute('role', 'dialog'); Z.setAttribute('aria-modal', 'true'); Z.setAttribute('aria-label', 'Фото крупно');
    Z.setAttribute('data-lenis-prevent', '');
    Z.innerHTML = '<div class="zs"></div><div class="zbar"><div class="zt"></div><div class="zvs"></div><button type="button" class="zx" aria-label="Закрыть"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div><div class="zl" aria-live="polite"></div>';
    document.body.appendChild(Z);
    var zs = $('.zs', Z), drag = null;
    $('.zx', Z).addEventListener('click', closeZoom);
    $('.zvs', Z).addEventListener('click', function (e) { var b = e.target.closest('[data-zv]'); if (b) zoomStep(0, +b.dataset.zv); });
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
  // кнопки камня внизу: граниты 3D-модели (те, что включены для раздела); у фото — без вариантов
  function zoomVs(r3) { return r3 && R3 ? R3.variants(cur && cur.id) : []; }
  function zoomBar(r3) {
    var zv = $('.zvs', Z), vs = zoomVs(r3); Z.r3 = r3 || '';
    var key = vs.length > 1 ? vs.map(function (x) { return x.id + ':' + x.name; }).join('|') : '-';
    if (zv.getAttribute('data-k') === key) return;
    zv.setAttribute('data-k', key);
    zv.innerHTML = vs.length > 1 ? vs.map(function (s, v) { return '<button type="button" data-zv="' + v + '"><i class="r3t" style="' + esc(R3.swatchCss(s)) + '"></i><span>' + esc(s.name) + '</span></button>'; }).join('') : '';
  }
  function zoomN() { return Z && Z.r3 ? zoomVs(Z.r3).length : 1; }
  // d — шаг стрелками, v — конкретный вариант
  function zoomStep(d, v) {
    var n = zoomN(); v = v == null ? (ZV + d + n) % n : v;
    if (Z.r3) zoom3d(Z.r3, v); else zoomVariant();
  }
  function zoom3d(code, v) {
    var m = list[idx], vs = zoomVs(code); if (!m || !vs[v]) return;
    zoomEl().classList.add('on'); zoomBar(code); Z.classList.remove('single'); ZF = null; ZV = v; ++ZTOK;
    [].forEach.call(Z.querySelectorAll('[data-zv]'), function (b) { b.setAttribute('aria-pressed', +b.dataset.zv === v ? 'true' : 'false'); });
    var cap = itemTitle(m, cur) + (vs.length > 1 ? ' · ' + vs[v].name : ''); $('.zt', Z).textContent = cap;
    var ph = new Image(); ph.decoding = 'async'; ph.className = 'r3z'; ph.src = R3.src(code, vs[v].id); ph.alt = cap; zoomSwap(ph, true);
    var st = PIC && PIC.querySelector('[data-r3]'); if (st) R3.show(st, v, true);
  }
  // фото модели крупно (4K): сначала средняя копия, затем оригинал
  function zoomVariant() {
    var m = list[idx]; if (!m) return;
    zoomBar('');
    var tok = ++ZTOK, cap = itemTitle(m, cur); ZV = 0;
    Z.classList.add('single');
    $('.zt', Z).textContent = cap;
    var ph = new Image(); ph.src = sized(m.img, 'md'); ph.alt = '';
    zoomSwap(ph); zoomLoading(true);
    getHi(m, function (im) {
      if (tok !== ZTOK) return;
      if (!im) { ZF = null; return zoomLoading(false); }
      var o = im.cloneNode(); o.alt = cap; zoomSwap(o, true);
    });
  }
  function openZoom(v, at) { zoomEl().classList.add('on'); ZF = at || null; zoomVariant(); var x = $('.zx', Z); if (x) x.focus({ preventScroll: true }); }
  // дополнительное фото модели (админка → «Доп. фото»): только просмотр, без вариантов камня
  function openPhoto(u, cap) {
    zoomEl().classList.add('on'); zoomBar(''); Z.classList.add('single'); ZF = null;
    var tok = ++ZTOK; $('.zt', Z).textContent = cap;
    var ph = new Image(); ph.src = sized(u, 'md'); ph.alt = cap; zoomSwap(ph); zoomLoading(true);
    loadImg(fresh(u), '', function (im) { if (tok !== ZTOK) return; zoomLoading(false); if (im) { var o = im.cloneNode(); o.alt = cap; zoomSwap(o, true); } });
    var x = $('.zx', Z); if (x) x.focus({ preventScroll: true });
  }
  function closeZoom() { if (!Z) return; ZTOK++; ZF = null; Z.classList.remove('on'); var zs = $('.zs', Z); zs.innerHTML = ''; zoomLoading(false); }
  function zoomOn() { return !!(Z && Z.classList.contains('on')); }
  if (PIC) PIC.addEventListener('click', function (e) {
    var b = e.target.closest('.sv'); if (!b) return;
    var st = R3 && b.querySelector('[data-r3]');
    if (st) { zoom3d(st.getAttribute('data-r3'), R3.current(st)); var x = $('.zx', Z); if (x) x.focus({ preventScroll: true }); return; }
    openZoom(+b.dataset.v);
  });

  /* ---------- «Детали»: линзы «грань и угол», «основание», «фактура камня» + доп. фото ---------- */
  var DTOK = 0, LZ = 6.5;
  function drawDetails(m) {
    var host = $('#clbDet'); if (!host) return;
    var tok = ++DTOK, md = sized(m.img, 'md'), c = codeOf(m), t = itemTitle(m, cur);
    var photos = (Array.isArray(m.photos) ? m.photos : []).filter(function (u) { return typeof u === 'string' && u; }).slice(0, 12);
    host.innerHTML = '';
    if (!LX) return;
    var r3 = R3 && multiStone(cur) && R3.codeOf(m.img); // у 3D-модели линзы с фото не показываем — только доп. фото
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
    if (r3) return put(null, 1);
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
    $('#clbD').innerHTML = badgeOf(m, pctOf(m, cur), 'cx-inl') + kitHtml(cur, m);
    $('#clbG').textContent = addon ? (has3d(cur, m) ? (CAT.granite || '') : groupMat(m, cur) ? '' : 'Изготовим из чёрного гранита — габбро-диабаза, в тон памятнику.') : (CAT.granite || '');
    var a = $('#clbCalc'), sec = $('#clb .acts .btn-line');
    if (addon) {
      a.href = '/#contact'; a.innerHTML = (m.price == null ? 'Узнать цену' : 'Заказать') + ' <span class="arr">→</span>';
      if (sec) { sec.href = '/#calc'; sec.textContent = 'Рассчитать памятник'; }
    } else {
      a.href = calcHref(m); a.innerHTML = 'Рассчитать стоимость <span class="arr">→</span>';
      if (sec) { sec.href = '/#contact'; sec.textContent = 'Консультация'; }
    }
    var c3 = R3 && multiStone(cur) ? R3.codeOf(m.img) : '';
    if (c3) draw3d(m, t, c3); else drawSingle(m, t);
    drawDetails(m);
    var nx = list[(idx + 1) % list.length];
    if (nx && nx !== m) { var n3 = R3 && multiStone(cur) ? R3.codeOf(nx.img) : '', pre = new Image(); pre.decoding = 'async'; pre.src = n3 ? R3.src(n3, R3.variants(cur.id)[0].id) : sized(nx.img, 'md'); }
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
      if (!multiStone(cur) || Z.classList.contains('single') || zoomN() < 2) return;
      if (e.key === 'ArrowLeft') zoomStep(-1);
      if (e.key === 'ArrowRight') zoomStep(1);
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
  var RT = 0; // номер перехода: отложенное открытие раздела не перебивает более поздний переход
  // #раздел или #раздел/группа (чипс)
  function hashAt() {
    var h = location.hash.slice(1); try { h = decodeURIComponent(h); } catch (e) {}
    var k = h.indexOf('/'); return { id: k < 0 ? h : h.slice(0, k), g: k < 0 ? '' : h.slice(k + 1) };
  }
  function route() {
    if ($('#clb').classList.contains('on')) close();
    var at = hashAt(), id = at.id, t = ++RT;
    if (id) GRP[id] = at.g;
    // раздел с 3D-моделями: ждём манифест рендеров (до 0,7 с), чтобы не показывать сначала фото
    if (id && R3 && !R3.settled()) {
      var went = false, go = function () { if (went || t !== RT || hashAt().id !== id) return; went = true; open(id); };
      setTimeout(go, 700); R3.load(go);
    } else if (id) open(id); else home();
    scrollTo(0, 0);
  }
  // манифест пришёл позже — перерисовываем открытый раздел с 3D (или обложки разделов)
  document.addEventListener('pamyat:3d', function () {
    var id = hashAt().id;
    if (!id) {
      if (!cur && box.querySelector('.cats') && !box.querySelector('[data-r3]') && X && cats().some(function (c) { return X.coverCode(c, R3); })) home();
      return;
    }
    if (!cur || cur.id !== id || !box.querySelector('.mgrid') || box.querySelector('.mgrid.r3g')) return;
    if (!multiStone(cur) || !list.some(function (m) { return R3.codeOf(m.img); })) return; // в разделе нет 3D-моделей
    open(id, true); if ($('#clb').classList.contains('on')) show(idx);
  });
  addEventListener('hashchange', route);
  document.addEventListener('pamyat:catalog', function (e) { CAT = e.detail; if (R3) R3.prefs(CAT); route(); });
  route();
})();
