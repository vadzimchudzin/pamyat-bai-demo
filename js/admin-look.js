/* ПАМЯТЬ.БАЙ — админка: «Оформление» (карусель работ, кнопки, лампада, голубь) с живым предпросмотром сайта.
   Поля строятся по списку PamyatLook.SPEC (js/look.js). Предпросмотр — сайт во фрейме /?preview=…:
   в него передаются текущие данные админки и черновик оформления, на сайт ничего не уходит до «Сохранить». */
(function () {
  'use strict';
  var K = window.AdminKit, LK = window.PamyatLook;
  if (!K || !LK) return;
  var $ = K.$, $$ = K.$$, esc = K.esc;
  var D = LK.normalize(null), dirty = false;
  var PV = { section: 'works', width: 1440, frame: null, ready: false, timer: 0 };
  var SECT = { works: 'works', buttons: 'contact', lamp: 'contact', dove: 'hero' };
  var SECT_LABEL = [['works', 'Карусель работ'], ['hero', 'Первый экран'], ['contact', 'Вопросы и контакты']];
  var WIDTHS = [[390, 'Телефон 390'], [1280, 'Ноутбук 1280'], [1440, '1440'], [1920, '1920'], [2560, '2560'], [3440, 'Ультраширокий 3440']];

  function specOf(g) { return LK.SPEC.filter(function (s) { return s[0] === g; }); }
  function fieldHTML(s) {
    var k = s[0] + '.' + s[1], v = D[s[0]][s[1]], hint = s[8] ? '<small>' + esc(s[8]) + '</small>' : '';
    if (s[3] === 'bool') return '<label class="chk look-chk"><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '> ' + esc(s[2]) + '</label>';
    if (s[3] === 'enum') return '<label class="look-f"><span>' + esc(s[2]) + '</span><select data-k="' + k + '">' +
      s[5].map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' + hint + '</label>';
    return '<label class="look-f"><span>' + esc(s[2]) + '</span><span class="look-rng">' +
      '<input type="range" data-k="' + k + '" min="' + s[5] + '" max="' + s[6] + '" step="' + s[7] + '" value="' + v + '">' +
      '<input type="number" data-k="' + k + '" min="' + s[5] + '" max="' + s[6] + '" step="' + s[7] + '" value="' + v + '"></span>' + hint + '</label>';
  }
  function groupHTML(g, title) {
    return '<div class="card look-g" data-g="' + g + '"><div class="look-gh"><b>' + esc(title) + '</b>' +
      '<span class="look-gt">' + (g === 'dove' ? '<button type="button" class="btn line sm" data-look-dove>Показать пролёт</button>' : '') +
      '<button type="button" class="link" data-look-reset="' + g + '">По умолчанию</button></span></div>' +
      '<div class="look-fields">' + specOf(g).map(fieldHTML).join('') + '</div></div>';
  }
  function previewHTML(compact) {
    return '<div class="look-pv' + (compact ? ' compact' : '') + '">' +
      '<div class="look-pvbar">' + (compact ? '<b>Предпросмотр карусели</b>' : '<span class="seg" role="group" aria-label="Что показать">' + SECT_LABEL.map(function (x) {
        return '<button type="button" data-pv-sec="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</span>') +
      '<select data-pv-w aria-label="Ширина экрана">' + WIDTHS.map(function (w) { return '<option value="' + w[0] + '">' + w[1] + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="link" data-pv-reload>Обновить</button></div>' +
      '<div class="look-pvbox"><div class="look-pvscale"><iframe title="Предпросмотр сайта" loading="lazy" tabindex="-1"></iframe></div><div class="look-pvwait">Загружаем сайт…</div></div>' +
      '<p class="hint look-pvhint">Так увидит посетитель. Черновик применяется сразу, на сайт — после «Сохранить».</p></div>';
  }

  /* ---------- черновик ---------- */
  function setVal(k, v, from) {
    var p = k.split('.'), s = LK.SPEC.filter(function (x) { return x[0] === p[0] && x[1] === p[1]; })[0]; if (!s) return;
    var raw = JSON.parse(JSON.stringify(D)); raw[p[0]][p[1]] = s[3] === 'bool' ? !!v : s[3] === 'enum' ? v : (v === '' ? s[4] : Number(v));
    D = LK.normalize(raw); dirty = true;
    $$('[data-k="' + k + '"]').forEach(function (el) {
      if (el === from) return;
      if (el.type === 'checkbox') el.checked = !!D[p[0]][p[1]]; else el.value = D[p[0]][p[1]];
    });
    if (p[0] === 'dove' && (p[1] === 'gapMin' || p[1] === 'gapMax')) ['dove.gapMin', 'dove.gapMax'].forEach(function (kk) { var q = kk.split('.'); $$('[data-k="' + kk + '"]').forEach(function (el) { if (el !== from) el.value = D[q[0]][q[1]]; }); });
    markDirty(); pushLook();
  }
  function markDirty() { $$('[data-look-save]').forEach(function (b) { b.classList.toggle('pulse', dirty); }); }
  function syncAll() {
    $$('[data-k]').forEach(function (el) { var p = el.dataset.k.split('.'), v = D[p[0]] && D[p[0]][p[1]]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; });
  }
  function save() {
    return K.save('look', D).then(function (d) { if (d && d.ok) { dirty = false; markDirty(); } return d; });
  }

  /* ---------- предпросмотр ---------- */
  function frames() { return $$('.look-pv iframe'); }
  function win(fr) { try { return fr.contentWindow && fr.contentWindow.pamyatPreview ? fr.contentWindow : null; } catch (e) { return null; } }
  function pushLook() {
    clearTimeout(PV.timer);
    PV.timer = setTimeout(function () {
      frames().forEach(function (fr) { var w = win(fr); if (w) try { w.pamyatPreview.look(JSON.parse(JSON.stringify(D))); } catch (e) { } setTimeout(function () { fit(fr.closest('.look-pv')); }, 250); });
    }, 60);
  }
  function pushAll(fr) {
    var w = win(fr); if (!w) return false;
    try { var c = K.content(); if (c) w.pamyatPreview.content(c); w.pamyatPreview.look(JSON.parse(JSON.stringify(D))); } catch (e) { }
    var box = fr.closest('.look-pvbox'); if (box) box.classList.add('ready');
    refit(fr.closest('.look-pv'));
    return true;
  }
  /* высота фрейма: первый экран — как у окна, остальные разделы — по их настоящей высоте (видно целиком) */
  function contentHeight(fr) {
    try {
      var d = fr.contentDocument, sec = fr.closest('.look-pv').dataset.sec;
      if (!d || !d.body || !win(fr) || sec === 'hero') return 0;
      var els = d.querySelectorAll(sec === 'works' ? '#works .wrap' : '#faq, #contact, footer'), bottom = 0;
      Array.prototype.forEach.call(els, function (el) {
        if (!el.offsetHeight) return;
        var r = el.getBoundingClientRect();
        bottom = Math.max(bottom, r.bottom + (d.defaultView.scrollY || 0));
      });
      return bottom > 0 ? Math.ceil(bottom + (sec === 'works' ? 48 : 0)) : 0;
    } catch (e) { return 0; }
  }
  function fit(pv) {
    var box = $('.look-pvbox', pv), sc = $('.look-pvscale', pv), fr = $('iframe', pv); if (!box || !fr) return;
    var w = +pv.dataset.w || PV.width, avail = box.clientWidth || 600, k = Math.min(1, avail / w);
    var h = w <= 600 ? 780 : Math.round(Math.min(1100, Math.max(640, w * .5)));
    var ch = contentHeight(fr); if (ch > 200) h = Math.min(2600, ch);
    else if (pv.dataset.sec === 'works') h = w <= 600 ? 900 : Math.round(Math.min(1200, Math.max(760, w * .62)));
    fr.style.width = w + 'px'; fr.style.height = h + 'px';
    sc.style.transform = 'scale(' + k + ')'; box.style.height = Math.round(h * k) + 'px';
  }
  function refit(pv) { [80, 500, 1500, 3500].forEach(function (t) { setTimeout(function () { fit(pv); }, t); }); }
  function load(pv, force) {
    var sec = pv.dataset.sec || 'works', fr = $('iframe', pv), src = '/?preview=' + sec + '&w=' + (pv.dataset.w || PV.width);
    fit(pv);
    if (!force && fr.dataset.src === src) return;
    var box = $('.look-pvbox', pv); box.classList.remove('ready');
    fr.dataset.src = src; fr.src = src;
    $$('[data-pv-sec]', pv).forEach(function (b) { b.classList.toggle('on', b.dataset.pvSec === sec); });
  }
  function mount(host, compact) {
    if (!host) return null;
    host.innerHTML = previewHTML(compact);
    var pv = host.firstChild; pv.dataset.sec = 'works'; pv.dataset.w = String(PV.width);
    $('[data-pv-w]', pv).value = String(PV.width);
    var fr = $('iframe', pv);
    fr.addEventListener('load', function () {
      var n = 0; (function tryPush() { if (pushAll(fr) || ++n > 40) return; setTimeout(tryPush, 150); })();
    });
    pv.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pv-sec]'); if (b) { pv.dataset.sec = b.dataset.pvSec; load(pv); return; }
      if (e.target.closest('[data-pv-reload]')) load(pv, true);
    });
    $('[data-pv-w]', pv).addEventListener('change', function (e) { pv.dataset.w = e.target.value; load(pv, true); });
    return pv;
  }
  function visible(el) { return !!(el && el.offsetParent); }
  function ensure() { $$('.look-pv').forEach(function (pv) { if (visible(pv)) load(pv); }); }

  /* ---------- отрисовка ---------- */
  function drawLook() {
    var c = K.content() || {};
    D = LK.normalize(c.look); dirty = false;
    var ed = $('#lookEd');
    if (ed) ed.innerHTML = LK.GROUPS.map(function (g) { return groupHTML(g[0], g[1]); }).join('');
    var wk = $('#worksLookEd');
    if (wk) wk.innerHTML = '<div class="look-gh"><b>Вид карусели на сайте</b><span class="look-gt"><button type="button" class="link" data-look-reset="works">По умолчанию</button>' +
      '<button type="button" class="btn gold sm" data-look-save>Сохранить вид</button></span></div>' +
      '<p class="hint">Сколько видно соседних работ, размытие по краям, затемнение низа фото и стрелки. Те же настройки — в разделе «Оформление».</p>' +
      '<div class="look-works"><div class="look-fields">' + specOf('works').map(fieldHTML).join('') + '</div><div class="look-wpv"></div></div>';
    if (!PV.main) PV.main = mount($('#lookPvHost'));
    if (wk && !PV.works) { PV.works = mount($('.look-wpv', wk), true); }
    else if (wk) { $('.look-wpv', wk).appendChild(PV.works); }
    markDirty();
    setTimeout(ensure, 50);
    frames().forEach(function (fr) { pushAll(fr); });
  }
  K.drawLook = drawLook;

  document.addEventListener('input', function (e) {
    var el = e.target; if (!el || !el.dataset || !el.dataset.k || !el.closest('#lookEd, #worksLookEd')) return;
    if (el.type === 'checkbox' || el.tagName === 'SELECT') return;
    setVal(el.dataset.k, el.value, el);
  });
  document.addEventListener('change', function (e) {
    var el = e.target; if (!el || !el.dataset || !el.dataset.k || !el.closest('#lookEd, #worksLookEd')) return;
    setVal(el.dataset.k, el.type === 'checkbox' ? el.checked : el.value, el.type === 'checkbox' || el.tagName === 'SELECT' ? null : el);
    if (el.type === 'number') el.value = D[el.dataset.k.split('.')[0]][el.dataset.k.split('.')[1]];
  });
  // поле в фокусе → в главном предпросмотре показываем нужную часть сайта
  document.addEventListener('focusin', function (e) {
    var g = e.target.closest && e.target.closest('#lookEd .look-g'); if (!g || !PV.main) return;
    var sec = SECT[g.dataset.g]; if (sec && PV.main.dataset.sec !== sec) { PV.main.dataset.sec = sec; load(PV.main); }
  });
  document.addEventListener('click', function (e) {
    var r = e.target.closest('[data-look-reset]');
    if (r) {
      var g = r.dataset.lookReset, raw = JSON.parse(JSON.stringify(D)); raw[g] = LK.defaults()[g]; D = LK.normalize(raw); dirty = true;
      syncAll(); markDirty(); pushLook(); return;
    }
    if (e.target.closest('[data-look-save]')) { save(); return; }
    if (e.target.closest('[data-look-dove]')) {
      if (PV.main && PV.main.dataset.sec !== 'hero') { PV.main.dataset.sec = 'hero'; load(PV.main); setTimeout(fly, 2600); } else fly();
    }
  });
  function fly() { frames().forEach(function (fr) { var w = win(fr); if (w && fr.closest('.look-pv').dataset.sec === 'hero') try { w.pamyatPreview.dove(); } catch (e) { } }); }
  // открыли раздел — подгружаем предпросмотр (фрейм тяжёлый, грузим только когда виден)
  var nav = $('#nav');
  if (nav) nav.addEventListener('click', function () { setTimeout(ensure, 30); });
  addEventListener('resize', function () { $$('.look-pv').forEach(fit); });
})();
