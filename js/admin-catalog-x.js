/* ПАМЯТЬ.БАЙ — админка, «Каталог»: граниты 3D-моделей (названия на сайте, какие показывать); в каждом разделе —
   граниты раздела, скидка и бейдж, 3D-модель на обложке, группы-чипсы; у моделей — группа, своя скидка и бейдж.
   admin.js не меняется: блоки добавляются после каждой перерисовки #catEd (MutationObserver) и пишут прямо в content.catalog.
   Сохраняет обычная кнопка «Сохранить»: readCatalog обновляет только свои поля, новые свойства объектов остаются.
   Атрибуты — data-cx (data-c занят обработчиком кликов admin.js), у полей нет name (их читает readCatalog). */
(function () {
  var AK = window.AdminKit, X = window.PamyatCatX, R3 = window.Pamyat3D || null, ed = document.getElementById('catEd');
  if (!AK || !X || !ed) return;
  var esc = AK.esc;
  var TONES = [['gold', 'Золотой'], ['sale', 'Красный'], ['dark', 'Тёмный'], ['green', 'Зелёный']];

  function cat() { var C = AK.content(); return C && C.catalog && Array.isArray(C.catalog.categories) ? C.catalog : null; }
  function catOf(el) { var K = cat(), card = el.closest('.catc'); return K && card ? K.categories[+card.dataset.ci] : null; }
  function itemOf(el) { var K = cat(), m = el.closest('.mod'); return K && m ? K.items[+m.dataset.gi] : null; }
  function manVs() { var M = R3 && R3.manifest && R3.manifest(); return M && M.variants || []; }
  function opts(list, cur) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
  function badgeOf(o) {
    var b = o && o.badge;
    if (typeof b === 'string') return { text: b, tone: 'gold' };
    return b && typeof b === 'object' ? { text: b.text || '', tone: b.tone || 'gold' } : { text: '', tone: 'gold' };
  }
  function setBadge(o, text, tone) { text = String(text || '').trim(); if (text) o.badge = { text: text.slice(0, 40), tone: tone || 'gold' }; else delete o.badge; }
  function discVal(o) { return o && o.discount != null && o.discount !== '' ? String(o.discount) : ''; }
  function setDisc(o, v) { v = String(v).trim(); if (v === '') { delete o.discount; return; } var n = Math.round(+v); if (isFinite(n)) o.discount = Math.max(0, Math.min(95, n)); }
  function stoneSet(K) {
    var s = K.stoneSet && typeof K.stoneSet === 'object' ? K.stoneSet : (K.stoneSet = {});
    if (!s.names || typeof s.names !== 'object') s.names = {};
    if (!Array.isArray(s.off)) s.off = [];
    return s;
  }
  // группы раздела: при первой правке список по умолчанию («Аксессуары») становится своим, у моделей сохраняется их группа
  function gsOf(c, K) {
    if (!Array.isArray(c.groups)) {
      (K.items || []).forEach(function (m) { if (m && m.cat === c.id && m.group == null) { var g = X.groupOf(m, c); if (g) m.group = g; } });
      c.groups = X.groups(c);
    }
    return c.groups;
  }
  // порядок показа: группа верхнего уровня, под ней её подгруппы (i — индекс в c.groups)
  function tree(gs) {
    var top = {}; gs.forEach(function (g) { if (g && !g.parent) top[g.id] = 1; });
    var isKid = function (g) { return !!(g && g.parent && g.parent !== g.id && top[g.parent]); };
    var out = [];
    gs.forEach(function (g, i) {
      if (!g || isKid(g)) return;
      out.push({ g: g, i: i, sub: false });
      gs.forEach(function (k, j) { if (isKid(k) && k.parent === g.id) out.push({ g: k, i: j, sub: true }); });
    });
    return out;
  }
  function groupOpts(gs) { return tree(gs).map(function (r) { return [r.g.id, (r.sub ? '— ' : '') + r.g.name]; }); }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }
  var OPEN = {}; // раскрыт ли список групп раздела (id раздела → true/false)
  function newId(gs) { var id; do { id = 'g' + Math.random().toString(36).slice(2, 7); } while (gs.some(function (g) { return g.id === id; })); return id; }

  /* ---------- разметка ---------- */
  function granitesHtml(K) {
    var vs = manVs(); if (!vs.length) return '';
    var s = K.stoneSet || {}, names = s.names || {}, off = s.off || [];
    return '<div class="card cx-granites"><b>Граниты 3D-моделей</b>' +
      '<p class="hint">Каждая 3D-модель отрисована в этих гранитах по фото образцов камня. Здесь — названия камней на сайте и какие из них показывать. В разделах ниже гранит можно выключить только для раздела.</p>' +
      '<div class="cx-st">' + vs.map(function (v) {
        return '<div class="cx-s"><i style="' + esc(R3.swatchCss(v)) + '"></i>' +
          '<input data-cx="s-name" data-id="' + esc(v.id) + '" value="' + esc(names[v.id] || '') + '" placeholder="' + esc(v.name) + '" aria-label="Название на сайте: ' + esc(v.name) + '">' +
          '<label class="chk"><input type="checkbox" data-cx="s-on" data-id="' + esc(v.id) + '"' + (off.indexOf(v.id) < 0 ? ' checked' : '') + '> На сайте</label></div>';
      }).join('') + '</div></div>';
  }
  function secHtml(c, K) {
    var b = badgeOf(c), vs = manVs(), s = K.stoneSet || {}, off = s.off || [], names = s.names || {}, cOff = Array.isArray(c.stoneOff) ? c.stoneOff : [];
    var codes = [];
    if (R3) (K.items || []).forEach(function (m) { if (m && m.cat === c.id) { var k = R3.codeOf(m.img); if (k && codes.indexOf(k) < 0) codes.push(k); } });
    var cv = c.cover || {}, r3sel = '';
    if (R3 && (codes.length || typeof cv.r3 === 'string')) {
      var auto = X.coverCode(Object.assign({}, c, { cover: Object.assign({}, cv, { r3: undefined }) }), R3);
      var list = [['', 'Авто: ' + (auto || 'фото')], ['-', 'Фото, без 3D']].concat(codes.map(function (k) { return [k, '3D: ' + k]; }));
      if (cv.r3 && codes.indexOf(cv.r3) < 0) list.push([cv.r3, '3D: ' + cv.r3]);
      r3sel = '<label>Обложка раздела<select data-cx="c-r3">' + opts(list, typeof cv.r3 === 'string' ? (cv.r3 || '-') : '') + '</select></label>';
    }
    var st = X.r3ok(c) && vs.length ? '<div class="cx-stones"><b>Граниты в разделе</b><div class="cx-sl">' + vs.map(function (v) {
      var g = off.indexOf(v.id) > -1;
      return '<label class="chk' + (g ? ' off' : '') + '"' + (g ? ' title="Выключен для всего сайта (карточка «Граниты 3D-моделей»)"' : '') + '><input type="checkbox" data-cx="c-stone" value="' + esc(v.id) + '"' +
        (!g && cOff.indexOf(v.id) < 0 ? ' checked' : '') + (g ? ' disabled' : '') + '><i style="' + esc(R3.swatchCss(v)) + '"></i>' + esc(names[v.id] || v.name) + '</label>';
    }).join('') + '</div></div>' : '';
    var gs = Array.isArray(c.groups) ? c.groups : X.groups(c), mat = X.isAddon(c);
    var tops = gs.filter(function (g) { return g && !g.parent; });
    // длинный список (каталог декора) свёрнут; раскрытый остаётся раскрытым после перерисовки
    var nTop = tops.length, nSub = gs.length - nTop, isOpen = OPEN[c.id] != null ? OPEN[c.id] : gs.length <= 8;
    var grp = '<details class="cx-groups" data-cxg="' + esc(c.id) + '"' + (isOpen ? ' open' : '') + '><summary><b>Группы — чипсы над моделями</b>' +
      (gs.length ? '<i>' + nTop + ' ' + plural(nTop, 'группа', 'группы', 'групп') + (nSub ? ', ' + nSub + ' ' + plural(nSub, 'подгруппа', 'подгруппы', 'подгрупп') : '') + '</i>' : '') + '</summary>' + (gs.length ? tree(gs).map(function (r) {
      var g = r.g, i = r.i;
      var par = '<select data-cx="g-parent" title="Подгруппа — второй ряд чипсов внутри группы">' + opts([['', 'Группа']].concat(tops.filter(function (t) { return t.id !== g.id; }).map(function (t) { return [t.id, 'в «' + t.name + '»']; })), r.sub ? g.parent : '') + '</select>';
      return '<div class="cx-g' + (mat ? '' : ' nomat') + (r.sub ? ' sub' : '') + '" data-gx="' + i + '"><input data-cx="g-name" value="' + esc(g.name || '') + '" placeholder="' + (r.sub ? 'Название подгруппы' : 'Название группы') + '" aria-label="Название группы">' +
        (mat ? '<input data-cx="g-mat" value="' + esc(g.material || '') + '" placeholder="' + (r.sub ? 'Материал — как у группы' : 'Материал, если не гранит') + '" title="Например: бронза — так и будет написано в карточке изделия">' : '') +
        par + '<button type="button" class="ic" data-cx="g-up" title="Выше">↑</button><button type="button" class="ic" data-cx="g-down" title="Ниже">↓</button>' +
        '<button type="button" class="ic del" data-cx="g-del" title="Удалить группу">✕</button>' +
        (mat ? '<input class="cx-gd" data-cx="g-desc" value="' + esc(g.desc || '') + '" maxlength="300" placeholder="Пояснение под чипсами (необязательно)">' : '') + '</div>';
    }).join('') : '<p class="hint cx-h">Групп нет — на сайте все модели раздела идут одним списком.</p>') +
      '<button type="button" class="link" data-cx="g-add">+ группа</button>' + (gs.length ? '<p class="hint cx-h">Группу или подгруппу модели выберите в её карточке ниже. Подгруппы — второй ряд чипсов внутри группы; пустые на сайте не показываются.</p>' : '') + '</details>';
    return '<div class="cx-sec">' +
      '<div class="cx-row"><label>Скидка, %<input data-cx="c-disc" type="number" min="0" max="95" step="1" value="' + esc(discVal(c)) + '" placeholder="нет"></label>' +
      '<label>Бейдж на обложке<input data-cx="c-badge" value="' + esc(b.text) + '" maxlength="40" placeholder="Например: Хит сезона"></label>' +
      '<label>Цвет бейджа<select data-cx="c-tone">' + opts(TONES, b.tone) + '</select></label>' + r3sel + '</div>' +
      '<p class="hint cx-h">Скидка: на сайте новая цена и зачёркнутая старая — у раздела и всех его моделей (у модели можно задать свою). Если текста бейджа нет, при скидке на фото появится «−N%».</p>' +
      st + grp + '</div>';
  }
  function modHtml(m, c) {
    var gs = X.groups(c), b = badgeOf(m), g = X.groupOf(m, c);
    return '<div class="cx-mod">' +
      (gs.length ? '<select data-cx="m-group" title="Группа (чипс на сайте)">' + opts([['', 'Без группы']].concat(groupOpts(gs)), g) + '</select>' : '') +
      '<div class="cx-r"><input data-cx="m-disc" type="number" min="0" max="95" step="1" value="' + esc(discVal(m)) + '" placeholder="−%" title="Скидка на модель, %: пусто — как у раздела, 0 — без скидки">' +
      '<input data-cx="m-badge" value="' + esc(b.text) + '" maxlength="40" placeholder="Бейдж" title="Бейдж на фото: «Хит», «Новинка»…"></div>' +
      '<select data-cx="m-tone" title="Цвет бейджа"' + (b.text ? '' : ' hidden') + '>' + opts(TONES, b.tone) + '</select></div>';
  }

  /* ---------- вставка после перерисовки ---------- */
  var obs = null;
  function fillCard(card, K) {
    var c = K.categories[+card.dataset.ci]; if (!c) return;
    var old = card.querySelector('.cx-sec'); if (old) old.parentNode.removeChild(old);
    var bar = card.querySelector('.top .bar'); if (bar) bar.insertAdjacentHTML('beforebegin', secHtml(c, K));
    [].forEach.call(card.querySelectorAll('.mod'), function (el) {
      var o = el.querySelector('.cx-mod'); if (o) o.parentNode.removeChild(o);
      var m = K.items[+el.dataset.gi], row = el.querySelector('.row'); if (m && row) row.insertAdjacentHTML('beforebegin', modHtml(m, c));
    });
  }
  function inject(force) {
    var K = cat(); if (!K || !ed.querySelector('.catc')) return;
    var g = ed.querySelector('.cx-granites');
    if (g && force) { g.parentNode.removeChild(g); g = null; }
    if (!g) { var h = granitesHtml(K); if (h) ed.querySelector('.catc').insertAdjacentHTML('beforebegin', h); }
    [].forEach.call(ed.querySelectorAll('.catc'), function (card) { if (force || !card.querySelector('.cx-sec')) fillCard(card, K); });
    if (obs) obs.takeRecords();
  }
  try { obs = new MutationObserver(function () { inject(false); }); obs.observe(ed, { childList: true }); } catch (e) {}
  ed.addEventListener('toggle', function (e) { var d = e.target; if (d && d.matches && d.matches('details[data-cxg]')) OPEN[d.getAttribute('data-cxg')] = d.open; }, true);
  if (R3) R3.load(function () { inject(true); });

  /* ---------- правки → content.catalog ---------- */
  ed.addEventListener('input', function (e) {
    var t = e.target, a = t.getAttribute && t.getAttribute('data-cx'), K = cat(); if (!a || !K) return;
    if (a === 's-name') { stoneSet(K).names[t.getAttribute('data-id')] = t.value.trim().slice(0, 60); return; }
    var c = catOf(t), m = itemOf(t), gx = t.closest('[data-gx]');
    if (!c) return;
    if (a === 'c-disc') setDisc(c, t.value);
    if (a === 'c-badge') setBadge(c, t.value, badgeOf(c).tone);
    if (gx && (a === 'g-name' || a === 'g-mat' || a === 'g-desc')) {
      var g = gsOf(c, K)[+gx.getAttribute('data-gx')]; if (!g) return;
      if (a === 'g-name') g.name = t.value.trim().slice(0, 40);
      else if (a === 'g-desc') { if (t.value.trim()) g.desc = t.value.trim().slice(0, 300); else delete g.desc; }
      else if (t.value.trim()) g.material = t.value.trim().slice(0, 40); else delete g.material;
      if (a === 'g-name') [].forEach.call(t.closest('.catc').querySelectorAll('[data-cx=m-group] option[value="' + g.id + '"]'), function (o) { o.textContent = (g.parent ? '— ' : '') + g.name; });
    }
    if (m && a === 'm-disc') setDisc(m, t.value);
    if (m && a === 'm-badge') {
      setBadge(m, t.value, badgeOf(m).tone);
      var tn = t.closest('.cx-mod').querySelector('[data-cx=m-tone]'); if (tn) tn.hidden = !t.value.trim();
    }
  });
  ed.addEventListener('change', function (e) {
    var t = e.target, a = t.getAttribute && t.getAttribute('data-cx'), K = cat(); if (!a || !K) return;
    if (a === 's-on') {
      var s = stoneSet(K), vs = manVs(), id = t.getAttribute('data-id');
      var on = vs.filter(function (v) { return v.id === id ? t.checked : s.off.indexOf(v.id) < 0; });
      if (!on.length) { t.checked = true; AK.toast('Оставьте на сайте хотя бы один гранит', true); return; }
      s.off = vs.filter(function (v) { return on.indexOf(v) < 0; }).map(function (v) { return v.id; });
      [].forEach.call(ed.querySelectorAll('.catc'), function (card) { fillCard(card, K); });
      return;
    }
    var c = catOf(t), m = itemOf(t); if (!c) return;
    if (a === 'c-tone') setBadge(c, badgeOf(c).text, t.value);
    if (a === 'c-r3') { c.cover = c.cover || {}; if (t.value === '') delete c.cover.r3; else c.cover.r3 = t.value === '-' ? '' : t.value; }
    if (a === 'c-stone') {
      var box = t.closest('.cx-sl'), all = [].slice.call(box.querySelectorAll('[data-cx=c-stone]:not(:disabled)'));
      if (!all.some(function (x) { return x.checked; })) { t.checked = true; AK.toast('В разделе должен остаться хотя бы один гранит', true); return; }
      var offIds = [].slice.call(box.querySelectorAll('[data-cx=c-stone]')).filter(function (x) { return !x.checked && !x.disabled; }).map(function (x) { return x.value; });
      if (offIds.length) c.stoneOff = offIds; else delete c.stoneOff;
    }
    if (m && a === 'm-group') { gsOf(c, K); m.group = t.value; }
    if (a === 'g-parent') {
      var gl = gsOf(c, K), gr = gl[+t.closest('[data-gx]').getAttribute('data-gx')]; if (!gr) return;
      if (t.value) {
        gr.parent = t.value;
        gl.forEach(function (k) { if (k.parent === gr.id) delete k.parent; }); // два уровня: подгруппы бывшей группы — снова группы
      } else delete gr.parent;
      fillCard(t.closest('.catc'), K);
      AK.toast('Изменено — не забудьте «Сохранить»');
    }
    if (m && a === 'm-tone') setBadge(m, badgeOf(m).text, t.value);
  });
  ed.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-cx]'), K = cat(); if (!b || !K) return;
    e.preventDefault();
    var c = catOf(b); if (!c) return;
    var gs = gsOf(c, K), row = b.closest('[data-gx]'), i = row ? +row.getAttribute('data-gx') : -1, a = b.getAttribute('data-cx');
    if (a === 'g-add') { gs.push({ id: newId(gs), name: 'Новая группа' }); OPEN[c.id] = true; }
    if ((a === 'g-up' || a === 'g-down') && i > -1) {
      // меняемся местами с соседом того же уровня (подгруппа — внутри своей группы)
      var me = gs[i], sib = gs.map(function (g, j) { return j; }).filter(function (j) { return (gs[j].parent || '') === (me.parent || ''); });
      var at = sib.indexOf(i), j2 = sib[a === 'g-up' ? at - 1 : at + 1];
      if (j2 != null) { gs[i] = gs[j2]; gs[j2] = me; }
    }
    if (a === 'g-del' && i > -1) {
      var g = gs[i], kids = gs.filter(function (k) { return k.parent === g.id; });
      if (!confirm('Удалить группу «' + (g.name || g.id) + '»? Модели останутся в разделе, без группы.' + (kids.length ? ' Подгруппы (' + kids.length + ') станут группами.' : ''))) return;
      gs.splice(i, 1);
      kids.forEach(function (k) { delete k.parent; });
      (K.items || []).forEach(function (m) { if (m && m.cat === c.id && m.group === g.id) m.group = ''; });
    }
    var card = b.closest('.catc'); fillCard(card, K);
    if (a === 'g-add') { var l = card.querySelectorAll('[data-cx=g-name]'), last = l[l.length - 1]; if (last) { last.focus(); last.select(); } }
    AK.toast('Изменено — не забудьте «Сохранить»');
  });
  inject(false);
})();
