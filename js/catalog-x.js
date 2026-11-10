/* ПАМЯТЬ.БАЙ — каталог: группы-чипсы в разделе (с подгруппами), скидки и бейджи (раздел или позиция), 3D-модель на обложке раздела.
   Общий модуль сайта (catalog.js, главная: home-3d.js), админки (admin-catalog-x.js) и сервера (api/_accessories.js — группы по умолчанию).
   Данные — в content.catalog из админки:
     раздел: groups [{ id, name, material?, parent? (id группы верхнего уровня — подгруппа), desc? }], discount (%), badge { text, tone },
             cover.r3 (код модели, '' — фото без 3D), stoneOff [id гранита];
     позиция: group (id группы или подгруппы), discount (%; 0 — без скидки раздела), badge { text, tone }, material?, color?, note?.
   Чистые функции проверяются в tests/catalog-x.test.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PamyatCatX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // «Аксессуары»: группы и подгруппы (parent) — весь каталог декора; пока в админке не задано своих
  var ACC_GROUPS = [
    { id: 'vases', name: 'Вазы', material: 'полимергранит', desc: '23 формы в семи цветах: чёрный, чёрный с золотом и с серебром, бронза, тёмный гранит, серебро, белый мрамор.' },
    { id: 'vases-black', name: 'Чёрные', parent: 'vases', desc: 'Универсальный цвет — подходит к большинству памятников и комплексов.' },
    { id: 'vases-gold', name: 'Чёрные с золотом', parent: 'vases' },
    { id: 'vases-silverblack', name: 'Чёрные с серебром', parent: 'vases' },
    { id: 'vases-bronze', name: 'Бронза', parent: 'vases' },
    { id: 'vases-granite', name: 'Тёмный гранит', parent: 'vases' },
    { id: 'vases-silver', name: 'Серебро', parent: 'vases' },
    { id: 'vases-marble', name: 'Белый мрамор', parent: 'vases', desc: 'Белые вазы выглядят элегантно и подходят к любому камню.' },
    { id: 'pots', name: 'Вазоны', material: 'полимергранит', desc: 'Низкий вазон — для искусственных цветов и живых растений.' },
    { id: 'lamps', name: 'Лампады' },
    { id: 'lamps-marble', name: 'Литьевой мрамор', parent: 'lamps', material: 'литьевой мрамор', desc: 'Простая конструкция со съёмной крышкой.' },
    { id: 'lamps-metal', name: 'Металлический корпус', parent: 'lamps', material: 'металлический корпус', desc: 'Дверца на магнитах; можно установить крестик на выбор.' },
    { id: 'parts', name: 'Комплектующие для лампад' },
    { id: 'parts-inserts', name: 'Вставки', parent: 'parts' },
    { id: 'parts-doors', name: 'Дверцы', parent: 'parts' },
    { id: 'parts-symbols', name: 'Крестики и символы', parent: 'parts' },
    { id: 'parts-glass', name: 'Стекло и держатели', parent: 'parts' },
    { id: 'sculpture', name: 'Скульптура' },
    { id: 'sculpture-marble', name: 'Белый мрамор', parent: 'sculpture' },
    { id: 'sculpture-bronze', name: 'Бронза', parent: 'sculpture' },
    { id: 'decor', name: 'Декор', material: 'литьевой мрамор', desc: 'Весь декор — в цветах бронза, золото, серебро; под заказ — мрамор и тёмный гранит.' },
    { id: 'decor-crosses', name: 'Кресты', parent: 'decor' },
    { id: 'decor-crucifix', name: 'Распятия', parent: 'decor' },
    { id: 'decor-flowers', name: 'Розы и цветы', parent: 'decor' },
    { id: 'decor-other', name: 'Голубь и свеча', parent: 'decor' },
    { id: 'bronze', name: 'Изделия из бронзы', material: 'бронза' },
    { id: 'bronze-crosses', name: 'Кресты и распятия', parent: 'bronze' },
    { id: 'bronze-frames', name: 'Рамки для фото', parent: 'bronze' },
    { id: 'bronze-decor', name: 'Голуби, ваза, лампада', parent: 'bronze' },
    { id: 'granite', name: 'Натуральный гранит', material: 'габбро-диабаз', desc: 'Лампады и вазы из габбро-диабаза. Религиозный символ на лампаду — по согласованию.' },
    { id: 'granite-lamps', name: 'Лампады', parent: 'granite' },
    { id: 'granite-vases', name: 'Вазы', parent: 'granite' },
    { id: 'other', name: 'Прочее' },
    { id: 'stands', name: 'Стенды', material: 'сталь с матовым полимерным покрытием', desc: 'Стенды с образцами изделий, 65 × 125 см — изготовим по запросу.' }
  ];
  // старые артикулы без группы (до каталога декора): V — вазы, L и «А-N» — лампады, T/G/S — прочее
  var ACC_BY_CODE = [[/^V\d/i, 'vases'], [/^(L\d|[АA]-\d)/i, 'lamps'], [/^[TGS]\d/i, 'other']];
  // Серии совпадают с обозначениями исходного каталога, без догадок о форме.
  var VERTICAL_GROUPS = 'ABCDEF'.split('').map(function (s) { return { id: 'series-' + s.toLowerCase(), name: 'Серия ' + s }; });
  var VERTICAL_LIMITS = { A: 1, B: 29, C: 30, D: 12, E: 12, F: 36 };
  function verticalCode(img) {
    var m = /^\/assets\/catalog\/(?:md\/|sm\/)?([A-F])(\d+)\.webp(?:[?#].*)?$/.exec(img || '');
    return m && +m[2] > 0 && +m[2] <= VERTICAL_LIMITS[m[1]] && String(+m[2]) === m[2] ? m[1] + m[2] : '';
  }
  function verticalOriginal(it, c) { var code = c && c.id === 'vertical' && it && verticalCode(it.img); return code ? '/assets/catalog-originals/' + code + '.webp' : ''; }
  var TONES = ['gold', 'sale', 'dark', 'green'];
  // обложка-3D по умолчанию: своё фото обложки похоже на эту модель (стела с волной — B7, ограда на столбиках — O10)
  var COVER_R3 = { vertical: 'B7', fence: 'O10' };
  var ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function num(v) { return v === '' || v == null || typeof v === 'boolean' ? NaN : Number(v); }
  function isAddon(c) { return !!c && (c.id === 'accessories' || c.calc === false); }
  // 3D-модели в разделе: вертикальные, горизонтальные, кресты, ограды (у оград calc:false — это не аксессуар); комплексы и аксессуары — фото
  var NO_R3 = { complex: 1, individual: 1, accessories: 1 };
  function r3ok(c) { return !!c && (c.stones === true || (c.stones !== false && !NO_R3[c.id])); }

  /* ---------- группы (чипсы) и подгруппы ---------- */
  function cleanGroups(list) {
    var seen = {};
    var out = (Array.isArray(list) ? list : []).filter(function (g) {
      if (!g || !ID.test(g.id || '') || !String(g.name || '').trim() || seen[g.id]) return false;
      return (seen[g.id] = true);
    }).map(function (g) {
      var o = { id: g.id, name: String(g.name).trim().slice(0, 60) };
      if (g.material) o.material = String(g.material).trim().slice(0, 60);
      if (g.parent && g.parent !== g.id && ID.test(String(g.parent))) o.parent = String(g.parent);
      if (g.desc && String(g.desc).trim()) o.desc = String(g.desc).trim().slice(0, 300);
      return o;
    });
    // подгруппа — только у группы верхнего уровня (два уровня)
    var top = {}; out.forEach(function (g) { if (!g.parent) top[g.id] = 1; });
    out.forEach(function (g) { if (g.parent && !top[g.parent]) delete g.parent; });
    return out;
  }
  function groups(c) {
    if (!c) return [];
    if (Array.isArray(c.groups)) return cleanGroups(c.groups);
    var defaults = c.id === 'accessories' ? ACC_GROUPS : c.id === 'vertical' ? VERTICAL_GROUPS : [];
    return defaults.map(function (g) { return Object.assign({}, g); });
  }
  function groupById(c, id) { if (!id) return null; var gs = groups(c); for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return gs[i]; return null; }
  function defaultGroup(code) {
    for (var i = 0; i < ACC_BY_CODE.length; i++) if (ACC_BY_CODE[i][0].test(String(code || '').trim())) return ACC_BY_CODE[i][1];
    return '';
  }
  function groupOf(it, c) {
    var gs = groups(c); if (!it || !gs.length) return '';
    var has = function (id) { return gs.some(function (g) { return g.id === id; }); };
    if (it.group != null && it.group !== '') return has(it.group) ? it.group : '';
    if (it.group === '') return ''; // в админке выбрано «без группы»
    if (!Array.isArray(c.groups) && c.id === 'accessories') { var d = defaultGroup(it.code); return has(d) ? d : ''; }
    if (!Array.isArray(c.groups) && c.id === 'vertical') {
      var m = /^([A-F])(\d+)$/.exec(String(it.code || ''));
      var v = m && +m[2] > 0 && +m[2] <= VERTICAL_LIMITS[m[1]] && String(+m[2]) === m[2] ? 'series-' + m[1].toLowerCase() : '';
      return has(v) ? v : '';
    }
    return '';
  }
  // группа верхнего уровня (для подгруппы — её родитель)
  function topOf(c, gid) { var g = groupById(c, gid); return g ? (g.parent || g.id) : ''; }
  // чипсы раздела: группы верхнего уровня, в которых есть позиции (n — вместе с подгруппами); kids — непустые подгруппы
  function usedGroups(c, items) {
    var gs = groups(c), n = {}, par = {};
    gs.forEach(function (g) { if (g.parent) par[g.id] = g.parent; });
    (items || []).forEach(function (it) {
      var g = groupOf(it, c); if (!g) return;
      n[g] = (n[g] || 0) + 1; if (par[g]) n[par[g]] = (n[par[g]] || 0) + 1;
    });
    return gs.filter(function (g) { return !g.parent && n[g.id]; }).map(function (g) {
      var o = Object.assign({ n: n[g.id] }, g);
      var kids = gs.filter(function (k) { return k.parent === g.id && n[k.id]; }).map(function (k) { return Object.assign({ n: n[k.id] }, k); });
      if (kids.length) o.kids = kids;
      return o;
    });
  }
  // позиции группы; у группы верхнего уровня — вместе с подгруппами
  function inGroup(items, c, gid) {
    if (!gid) return (items || []).slice();
    var kid = {}; groups(c).forEach(function (g) { if (g.parent === gid) kid[g.id] = 1; });
    return (items || []).filter(function (it) { var g = groupOf(it, c); return g === gid || !!kid[g]; });
  }
  // материал позиции: свой, подгруппы или группы (бронза, полимергранит…); '' — не указан
  function materialOf(it, c) {
    if (it && it.material) return String(it.material);
    var g = groupById(c, groupOf(it, c)); if (!g) return '';
    if (g.material) return g.material;
    var p = groupById(c, g.parent); return p && p.material || '';
  }
  // описание выбранной группы (подгруппы — её своё, иначе группы)
  function descOf(c, gid) {
    var g = groupById(c, gid); if (!g) return '';
    if (g.desc) return g.desc;
    var p = groupById(c, g.parent); return p && p.desc || '';
  }

  /* ---------- скидки ---------- */
  function clampPct(v) { var n = num(v); return isFinite(n) && n > 0 ? Math.min(95, Math.round(n)) : 0; }
  // своя скидка позиции важнее скидки раздела (0 у позиции — без скидки)
  function pct(it, c) {
    if (it && Object.prototype.hasOwnProperty.call(it, 'discount') && it.discount !== '' && it.discount != null && isFinite(num(it.discount))) return clampPct(it.discount);
    return c ? clampPct(c.discount) : 0;
  }
  function sale(price, p) { var n = num(price); if (!isFinite(n)) return null; return p ? Math.round(n * (100 - p) / 100) : Math.round(n); }
  function fmtDefault(n) { return Number(n).toLocaleString('ru-RU'); }
  // «от 1 020 BYN 1 200 BYN» — новая цена и зачёркнутая старая
  function priceHtml(price, p, fmt, from) {
    var n = num(price); fmt = fmt || fmtDefault;
    if (!isFinite(n)) return '';
    var prefix = from === false ? '' : 'от ';
    if (!p) return prefix + fmt(Math.round(n * 100) / 100) + ' BYN';
    return prefix + fmt(sale(n, p)) + ' BYN <s class="cx-old">' + fmt(Math.round(n * 100) / 100) + ' BYN</s>';
  }

  /* ---------- бейджи ---------- */
  function badge(o, p) {
    var b = o && o.badge, t = '', tone = 'gold';
    if (typeof b === 'string') t = b.trim();
    else if (b && typeof b === 'object') { t = String(b.text || '').trim(); if (TONES.indexOf(b.tone) > -1) tone = b.tone; }
    if (t) return { text: t.slice(0, 40), tone: tone };
    return p ? { text: '−' + p + '%', tone: 'sale' } : null;
  }
  function badgeHtml(b, extra) { return b ? '<span class="cx-badge' + (extra ? ' ' + extra : '') + '" data-tone="' + esc(b.tone) + '">' + esc(b.text) + '</span>' : ''; }

  /* ---------- 3D на обложке раздела ---------- */
  // R3 — js/catalog-3d.js; cover.r3: код модели, '' — фото без 3D; по умолчанию — исходное фото каталога с рендером или похожая модель
  function coverCode(c, R3) {
    if (!c || !R3 || !R3.has) return '';
    var cv = c.cover || {};
    if (typeof cv.r3 === 'string') return cv.r3 && R3.has(cv.r3) ? cv.r3 : '';
    // На обложке вертикальных моделей исходный вид точнее реконструкции; выбор админа выше сохраняется.
    if (c.id === 'vertical' || !r3ok(c)) return '';
    var own = R3.codeOf ? R3.codeOf(cv.img) : '';
    if (own) return own;
    var d = COVER_R3[c.id];
    return d && R3.has(d) ? d : '';
  }

  return { ACC_GROUPS: ACC_GROUPS, VERTICAL_GROUPS: VERTICAL_GROUPS, verticalOriginal: verticalOriginal, COVER_R3: COVER_R3, TONES: TONES, esc: esc, isAddon: isAddon, r3ok: r3ok,
    groups: groups, cleanGroups: cleanGroups, groupById: groupById, defaultGroup: defaultGroup, groupOf: groupOf, topOf: topOf, usedGroups: usedGroups, inGroup: inGroup,
    materialOf: materialOf, descOf: descOf,
    pct: pct, clampPct: clampPct, sale: sale, priceHtml: priceHtml, badge: badge, badgeHtml: badgeHtml, coverCode: coverCode };
});
