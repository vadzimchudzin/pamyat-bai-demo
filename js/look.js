/* ПАМЯТЬ.БАЙ — настройки оформления сайта (админка → «Оформление»): карусель работ, кнопки, лампада, голубь.
   Общий модуль для сайта, админки и тестов. На сайте apply() раскладывает значения в CSS-переменные
   и классы <html>, а скрипты эффектов (lamp.js, fx.js) получают событие «pamyat:look». */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PamyatLook = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* [группа, ключ, подпись, тип, по умолчанию, мин, макс, шаг, подсказка] — по этому списку строится форма в админке */
  var SPEC = [
    ['works', 'perRow', 'Карточек в ряд на компьютере', 'num', 3, 2, 4, 1, 'На планшете — 2, на телефоне — 1'],
    ['works', 'peek', 'Видно соседних карточек по краям, px', 'num', 150, 0, 360, 2, 'Сколько пикселей соседних работ видно слева и справа (на широких экранах дальше не тянется)'],
    ['works', 'blur', 'Размытие соседних карточек, px', 'num', 5, 0, 16, 0.5, '0 — без размытия'],
    ['works', 'dim', 'Приглушение соседних карточек, %', 'num', 30, 0, 80, 1, 'Светлая вуаль поверх соседних кадров'],
    ['works', 'shade', 'Затемнение низа фото, %', 'num', 90, 0, 100, 1, 'Плотность градиента снизу на каждой карточке'],
    ['works', 'shadeHeight', 'Высота затемнения, % карточки', 'num', 45, 15, 80, 1, 'У карточек с подписью затемнение не опускается ниже уровня, нужного для читаемости текста'],
    ['works', 'arrows', 'Стрелки', 'enum', 'edge', [['edge', 'У краёв карточек'], ['fields', 'В полях по бокам'], ['hidden', 'Скрыть (листание свайпом и точками)']]],
    ['works', 'arrowInset', 'Заход стрелки на карточку, px', 'num', 16, -30, 40, 1, 'Положительное значение — стрелка чуть заходит на край крайней карточки'],
    ['works', 'autoplay', 'Автопрокрутка, сек', 'num', 0, 0, 20, 1, '0 — выключена. Пауза при наведении и касании'],
    ['buttons', 'rim', 'Бегущий ободок при наведении', 'bool', true],
    ['buttons', 'rimSpeed', 'Скорость ободка, сек на круг', 'num', 3.2, 1.2, 9, 0.1, 'Меньше — быстрее'],
    ['buttons', 'fire', 'Огонь внутри кнопок, %', 'num', 30, 0, 100, 1, 'Еле заметное живое тепло внутри кнопки'],
    ['buttons', 'fireAlways', 'Огонь виден всегда (иначе — только при наведении)', 'bool', true],
    ['lamp', 'enabled', 'Свет лампады включён', 'bool', true],
    ['lamp', 'power', 'Яркость пламени, %', 'num', 130, 40, 200, 1, ''],
    ['lamp', 'reach', 'Дальность света, %', 'num', 140, 50, 240, 1, 'Насколько далеко от огня видны отражения и тени'],
    ['lamp', 'shadow', 'Сила теней, %', 'num', 100, 0, 200, 1, 'Тени ложатся вправо-вниз от элементов'],
    ['lamp', 'crisp', 'Чёткость теней, %', 'num', 70, 0, 100, 1, '0 — мягкие, 100 — с чётким краем'],
    ['lamp', 'reflect', 'Отражения огня на элементах, %', 'num', 100, 0, 200, 1, 'Тёплая кромка и блики со стороны огня'],
    ['dove', 'enabled', 'Голубь в небе на первом экране', 'bool', true],
    ['dove', 'gapMin', 'Пауза между пролётами от, сек', 'num', 25, 8, 180, 1, ''],
    ['dove', 'gapMax', 'Пауза между пролётами до, сек', 'num', 45, 10, 300, 1, ''],
    ['dove', 'size', 'Размер, px', 'num', 26, 12, 60, 1, ''],
    ['dove', 'opacity', 'Заметность, %', 'num', 65, 15, 100, 1, 'Голубь белый: на светлом небе он еле различим — так и задумано'],
    ['dove', 'speed', 'Скорость полёта, %', 'num', 100, 40, 220, 1, '']
  ];
  var GROUPS = [['works', 'Карусель «Примеры работ»'], ['buttons', 'Кнопки'], ['lamp', 'Лампада: свет, тени, отражения'], ['dove', 'Голубь']];

  function defaults() {
    var d = {};
    SPEC.forEach(function (s) { (d[s[0]] = d[s[0]] || {})[s[1]] = s[4]; });
    return d;
  }
  function clamp(v, s) {
    if (s[3] === 'bool') return v === undefined || v === null ? s[4] : v === true || v === 'true' || v === 1 || v === '1';
    if (s[3] === 'enum') return s[5].some(function (o) { return o[0] === v; }) ? v : s[4];
    var n = Number(v);
    if (v === '' || v == null || !isFinite(n)) return s[4];
    var st = s[7] || 1;
    n = Math.max(s[5], Math.min(s[6], Math.round(n / st) * st));
    return Math.round(n * 1000) / 1000;
  }
  function normalize(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    SPEC.forEach(function (s) {
      var g = raw[s[0]] && typeof raw[s[0]] === 'object' ? raw[s[0]] : {};
      (out[s[0]] = out[s[0]] || {})[s[1]] = clamp(g[s[1]], s);
    });
    if (out.dove.gapMax < out.dove.gapMin) out.dove.gapMax = out.dove.gapMin;
    return out;
  }
  function vars(look) {
    var L = normalize(look), w = L.works, b = L.buttons, l = L.lamp;
    return {
      '--wk-n-desk': String(w.perRow), '--wk-peek': w.peek + 'px', '--wk-blur': w.blur + 'px', '--wk-dim': String(w.dim / 100),
      '--wk-shade': String(w.shade / 100), '--wk-shade-h': w.shadeHeight + '%', '--wk-arin': w.arrowInset + 'px',
      '--rim-speed': b.rimSpeed + 's', '--fire': String(b.fire / 100),
      '--lamp-power': String(l.power / 100), '--lamp-shadow': String(l.shadow / 100), '--lamp-crisp': String(l.crisp / 100),
      '--lamp-reflect': String(l.reflect / 100)
    };
  }
  function classes(look) {
    var L = normalize(look);
    return {
      'fx-norim': !L.buttons.rim, 'fx-fire-hover': !L.buttons.fireAlways, 'fx-nofire': L.buttons.fire <= 0,
      'wk-arrows-fields': L.works.arrows === 'fields', 'wk-arrows-hidden': L.works.arrows === 'hidden',
      'lamp-off': !L.lamp.enabled
    };
  }
  /* сайт: CSS-переменные и классы на <html>, событие для эффектов */
  function apply(look, doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    var L = normalize(look);
    if (typeof window !== 'undefined') window.PAMYAT_LOOK = L;
    if (!doc) return L;
    var el = doc.documentElement, v = vars(L), c = classes(L);
    Object.keys(v).forEach(function (k) { el.style.setProperty(k, v[k]); });
    Object.keys(c).forEach(function (k) { el.classList.toggle(k, !!c[k]); });
    try { doc.dispatchEvent(new CustomEvent('pamyat:look', { detail: L })); } catch (e) { }
    return L;
  }
  function get() { return (typeof window !== 'undefined' && window.PAMYAT_LOOK) || normalize(null); }
  return { SPEC: SPEC, GROUPS: GROUPS, defaults: defaults, normalize: normalize, vars: vars, classes: classes, apply: apply, get: get };
});
