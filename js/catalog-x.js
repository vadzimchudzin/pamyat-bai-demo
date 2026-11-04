/* ПАМЯТЬ.БАЙ — каталог: группы-чипсы в разделе, скидки и бейджи (раздел или позиция), 3D-модель на обложке раздела.
   Общий модуль сайта (catalog.js, главная: home-3d.js), админки (admin-catalog-x.js) и сервера (api/_accessories.js — группы по умолчанию).
   Данные — в content.catalog из админки:
     раздел: groups [{ id, name, material? }], discount (%), badge { text, tone }, cover.r3 (код модели, '' — фото без 3D), stoneOff [id гранита];
     позиция: group (id группы), discount (%; 0 — без скидки раздела), badge { text, tone }.
   Чистые функции проверяются в tests/catalog-x.test.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PamyatCatX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // «Аксессуары»: группы, пока в админке не задано своих
  var ACC_GROUPS = [
    { id: 'vases', name: 'Вазы' }, { id: 'lamps', name: 'Лампады' }, { id: 'tables', name: 'Столики и скамьи' },
    { id: 'stands', name: 'Подставки' }, { id: 'bronze', name: 'Изделия из бронзы', material: 'бронза' }
  ];
  var ACC_BY_CODE = [[/^V/i, 'vases'], [/^(L|[АA]-?\d)/i, 'lamps'], [/^T/i, 'tables'], [/^[GS]/i, 'stands']];
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

  /* ---------- группы (чипсы) ---------- */
  function cleanGroups(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (g) {
      if (!g || !ID.test(g.id || '') || !String(g.name || '').trim() || seen[g.id]) return false;
      return (seen[g.id] = true);
    }).map(function (g) { var o = { id: g.id, name: String(g.name).trim().slice(0, 60) }; if (g.material) o.material = String(g.material).trim().slice(0, 60); return o; });
  }
  function groups(c) {
    if (!c) return [];
    if (Array.isArray(c.groups)) return cleanGroups(c.groups);
    return c.id === 'accessories' ? ACC_GROUPS.map(function (g) { return Object.assign({}, g); }) : [];
  }
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
    return '';
  }
  // чипсы раздела: только группы, в которых есть позиции
  function usedGroups(c, items) {
    var n = {};
    (items || []).forEach(function (it) { var g = groupOf(it, c); if (g) n[g] = (n[g] || 0) + 1; });
    return groups(c).filter(function (g) { return n[g.id]; }).map(function (g) { return Object.assign({ n: n[g.id] }, g); });
  }
  function inGroup(items, c, gid) { return gid ? (items || []).filter(function (it) { return groupOf(it, c) === gid; }) : (items || []).slice(); }

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
  function priceHtml(price, p, fmt) {
    var n = num(price); fmt = fmt || fmtDefault;
    if (!isFinite(n)) return '';
    if (!p) return 'от ' + fmt(Math.round(n)) + ' BYN';
    return 'от ' + fmt(sale(n, p)) + ' BYN <s class="cx-old">' + fmt(Math.round(n)) + ' BYN</s>';
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
    if (!r3ok(c)) return '';
    var own = R3.codeOf ? R3.codeOf(cv.img) : '';
    if (own) return own;
    var d = COVER_R3[c.id];
    return d && R3.has(d) ? d : '';
  }

  return { ACC_GROUPS: ACC_GROUPS, COVER_R3: COVER_R3, TONES: TONES, esc: esc, isAddon: isAddon, r3ok: r3ok,
    groups: groups, cleanGroups: cleanGroups, defaultGroup: defaultGroup, groupOf: groupOf, usedGroups: usedGroups, inGroup: inGroup,
    pct: pct, clampPct: clampPct, sale: sale, priceHtml: priceHtml, badge: badge, badgeHtml: badgeHtml, coverCode: coverCode };
});
