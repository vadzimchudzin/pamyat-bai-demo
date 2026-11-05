/* ПАМЯТЬ.БАЙ — каталог «люкс»: студийные фото (tools/media/studio.py), золотые линии, лупа «Детали».
   Общий модуль для каталога (/catalog), блока каталога на главной и админки.
   Чистые функции (адреса фото, обложки, линзы, маска фона для «студии» в админке) проверяются в tests/catalog-lux.test.js. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PamyatLux = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // версия студийной обработки: новый адрес фото, чтобы браузер не показал старую копию из кэша (кэш фото — 7 дней)
  var V = 's3';
  var ASSET = /^\/assets\/catalog\/(?:md\/|sm\/)?([A-Za-z0-9_-]+)\.webp(?:[?#].*)?$/;
  // аксессуары (каталог декора): /assets/acc/<артикул>.webp — 1200 px, sm/ — 640 px; своя версия кэша
  var ACC = /^\/assets\/acc\/(?:sm\/)?([a-z0-9_-]+)\.webp(?:[?#].*)?$/i, VA = 'a1';
  // обложки разделов, переснятые студией: прежний адрес → [файл, масштаб и кадр, под которые была настроена старая обложка]
  var COVERS = {
    '/api/img?id=8': ['cover-vertical', 1.2, ''],
    '/api/img?id=5': ['cover-complex', 1.35, '50% 40%'],
    '/api/img?id=9': ['cover-fence', 1.15, ''],
    '/assets/catalog/I26.webp': ['cover-horizontal', 1, ''],
    '/assets/catalog/P3.webp': ['cover-cross', 1, ''],
    '/assets/catalog/L1.webp': ['cover-accessories', 1, '']
  };
  // кадр студии по разделу (как в tools/media/studio.py): пропорции подложки и поля
  var FRAMES = {
    portrait: { ar: 3 / 4, mw: 0.70, mh: 0.83, floor: 0.915 },
    landscape: { ar: 5 / 4, mw: 0.78, mh: 0.78, floor: 0.90 },
    square: { ar: 1, mw: 0.80, mh: 0.80, floor: 0.905 },
    wide: { ar: 3 / 2, mw: 0.86, mh: 0.74, floor: 0.885 },
    cover: { ar: 4 / 3, mw: 0.82, mh: 0.80, floor: 0.905 }
  };
  var CAT_FRAME = { vertical: 'portrait', cross: 'portrait', horizontal: 'landscape', complex: 'square', fence: 'wide', accessories: 'square' };
  var DEPTH = { complex: 1, fence: 1 }; // объёмные изделия: тень по силуэту, а не «пятно» под тумбой

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = +v; return isFinite(v) && v > 0 ? v : d; }
  function code(u) { var m = ASSET.exec(u || ''); return m ? m[1] : ''; }
  function acc(u) { var m = ACC.exec(u || ''); return m ? m[1] : ''; }
  function isStudio(u, flag) { return flag === true || !!code(u) || !!acc(u); }
  function url(u) {
    var c = code(u); if (c) return '/assets/catalog/' + c + '.webp?v=' + V;
    var a = acc(u); return a ? '/assets/acc/' + a + '.webp?v=' + VA : (u || '');
  }
  function sized(u, size) {
    var c = code(u), a = acc(u);
    if (c) return '/assets/catalog/' + (size ? size + '/' : '') + c + '.webp?v=' + V;
    if (a) return '/assets/acc/' + (size === 'sm' ? 'sm/' : '') + a + '.webp?v=' + VA;
    if (size && /^\/api\/img\?/.test(u || '') && !/[?&]w=/.test(u)) return u + '&w=' + (size === 'sm' ? 640 : 1600);
    return u || '';
  }
  function frameOf(catId) { return CAT_FRAME[catId] || 'square'; }
  function stageAr(catId) { var f = FRAMES[frameOf(catId)]; return f.ar; }
  /* обложка раздела: переснятая студией — свой файл и масштаб 1 (настройка из админки сохраняется относительно старой) */
  function cover(cv) {
    cv = cv || {};
    var img = cv.img || '', z = num(cv.zoom, 1), pos = String(cv.pos || ''), hit = COVERS[img];
    if (hit) return { img: '/assets/catalog/' + hit[0] + '.webp', zoom: +clamp(z / hit[1], 0.8, 2.2).toFixed(3), pos: pos && pos !== hit[2] ? pos : '', studio: true };
    return { img: img, zoom: +clamp(z, 0.8, 2.2).toFixed(3), pos: pos, studio: isStudio(img, cv.studio) };
  }

  /* ---------- разметка: рамка, разделитель, стрелка, эскиз для «Индивидуального проекта» ---------- */
  function frame(rx) {
    var r = rx == null ? 10 : rx;
    return '<svg class="lx-fr" aria-hidden="true" focusable="false"><rect class="ln" width="100%" height="100%" rx="' + r + '" pathLength="1"/>' +
      '<rect class="sp" width="100%" height="100%" rx="' + r + '" pathLength="1"/></svg>';
  }
  function glint() { return '<i class="lx-gl" aria-hidden="true"></i>'; }
  function rule(cls) { return '<i class="lx-rule' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><i></i></i>'; }
  function go(text) { return '<b class="lx-go">' + text + '<i aria-hidden="true"></i></b>'; }
  // линейный эскиз: земля, тумба, стела с аркой, осевая, циркульная дуга, размерная линия и карандаш
  function sketch() {
    var p = function (d, k, cls) { return '<path class="' + (cls || 's') + '" style="--k:' + k + '" d="' + d + '" pathLength="1"/>'; };
    return '<svg class="lx-sk" viewBox="0 0 240 170" aria-hidden="true" focusable="false">' +
      p('M22 146H218', 0, 's g') +
      p('M30 146l-8 8M48 146l-8 8M66 146l-8 8M174 146l-8 8M192 146l-8 8M210 146l-8 8', 1, 's f') +
      p('M78 146V124H162V146', 2) +
      p('M92 124V62A28 28 0 0 1 148 62V124', 3) +
      p('M120 22V156', 4, 's d') +
      '<circle class="s d" style="--k:5" cx="120" cy="62" r="28" pathLength="1"/>' +
      p('M100 102H140M100 110H132', 6, 's f') +
      p('M62 34V124M57 34H67M57 124H67M62 34l-3 8M62 34l3 8M62 124l-3-8M62 124l3-8', 7, 's f') +
      p('M196 30l12 12-44 44-17 5 5-17z', 8) +
      p('M152 74l12 12M190 36l12 12', 9, 's f') +
      '<circle class="s dot" style="--k:10" cx="147" cy="91" r="1.6" pathLength="1"/></svg>';
  }

  /* ---------- линза «Детали»: фон линзы — то же фото, увеличенное в Z раз ---------- */
  // f — точка [x, y] в долях кадра; Z — во сколько раз фото шире линзы; ar — ширина/высота фото (линза круглая)
  function lens(f, Z, ar) {
    var zx = Math.max(1.01, Z), zy = Math.max(1.01, Z / (ar || 1));
    var px = clamp((f[0] * zx - 0.5) / (zx - 1), 0, 1), py = clamp((f[1] * zy - 0.5) / (zy - 1), 0, 1);
    return { size: (zx * 100).toFixed(1) + '% auto', pos: (px * 100).toFixed(2) + '% ' + (py * 100).toFixed(2) + '%', fx: px, fy: py };
  }
  // точка, которую линза показывает в центре (для перехода в 4K-просмотр с тем же местом)
  function lensCenter(f, Z, ar) {
    var L = lens(f, Z, ar), zx = Math.max(1.01, Z), zy = Math.max(1.01, Z / (ar || 1));
    return [(L.fx * (zx - 1) + 0.5) / zx, (L.fy * (zy - 1) + 0.5) / zy];
  }
  var DETAILS = [['corner', 'Грань и угол'], ['base', 'Основание'], ['texture', 'Фактура камня']];
  function focusList(arr) {
    if (!arr || arr.length < 6) return null;
    for (var i = 0; i < 6; i++) if (!isFinite(+arr[i])) return null;
    return DETAILS.map(function (d, i) { return { key: d[0], label: d[1], f: [clamp(+arr[2 * i], 0, 1), clamp(+arr[2 * i + 1], 0, 1)] }; });
  }
  /* «Фактура камня» — участок с самой богатой резьбой / рисунком внутри изделия (как texture_point в studio.py):
     фаски и контур по краю, трава цветника и места линз «грань» / «основание» не считаются;
     гладкая полированная стела → null (берём самую «глубокую» точку) */
  function texturePoint(d, a, w, h, avoid, Z) {
    Z = Z || 6.5;
    var n = w * h, i, x, y, k, m = new Uint8Array(n), Y = new Float32Array(n), gr = new Uint8Array(n), y0 = h, y1 = -1;
    for (i = 0; i < n; i++) {
      var r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
      Y[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (a[i] > 0.5) { m[i] = 1; y = (i / w) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; if (g - Math.max(r, b) > 0.06) gr[i] = 1; }
    }
    if (y1 < 0) return null;
    // расстояние до края изделия (за рамкой кадра — фон)
    var dt = new Float32Array(n), D2 = Math.SQRT2;
    for (i = 0; i < n; i++) dt[i] = m[i] ? 1e9 : 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (!m[i]) continue;
      dt[i] = Math.min(dt[i], x ? dt[i - 1] + 1 : 1, y ? dt[i - w] + 1 : 1, x && y ? dt[i - w - 1] + D2 : D2, x < w - 1 && y ? dt[i - w + 1] + D2 : D2);
    }
    for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
      i = y * w + x; if (!m[i]) continue;
      dt[i] = Math.min(dt[i], x < w - 1 ? dt[i + 1] + 1 : 1, y < h - 1 ? dt[i + w] + 1 : 1, x < w - 1 && y < h - 1 ? dt[i + w + 1] + D2 : D2, x && y < h - 1 ? dt[i + w - 1] + D2 : D2);
    }
    var M = Math.max(w, h), din = Math.max(2, 0.025 * M), G = new Float32Array(n);
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x; if (!m[i] || gr[i] || dt[i] < din) continue;
      var gx = (Y[i - w + 1] - Y[i - w - 1] + 2 * (Y[i + 1] - Y[i - 1]) + Y[i + w + 1] - Y[i + w - 1]) / 8,
        gy = (Y[i + w - 1] - Y[i - w - 1] + 2 * (Y[i + w] - Y[i - w]) + Y[i + w + 1] - Y[i - w + 1]) / 8;
      G[i] = Math.sqrt(gx * gx + gy * gy);
    }
    var W1 = w + 1;
    var integ = function (f) {
      var I = new Float64Array(W1 * (h + 1));
      for (y = 0; y < h; y++) { var row = 0; for (x = 0; x < w; x++) { row += f[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; } }
      return I;
    };
    var Im = integ(m), Ig = integ(G), Igr = integ(gr), win = Math.max(5, Math.round(w / Z * 0.7) | 1), hr = win >> 1, A = win * win;
    var box = function (I, x, y) {
      var xa = Math.max(0, x - hr), xb = Math.min(w, x + hr + 1), ya = Math.max(0, y - hr), yb = Math.min(h, y + hr + 1);
      return (I[yb * W1 + xb] - I[ya * W1 + xb] - I[yb * W1 + xa] + I[ya * W1 + xa]) / A;
    };
    var lim = Math.floor(y0 + (y1 - y0) * 0.82), rr = Math.pow(0.9 * w / Z, 2), best = -1, bx = 0, by = 0;
    avoid = avoid || [];
    for (y = 0; y < lim; y++) for (x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      var cov = box(Im, x, y); if (cov < 0.88 || box(Igr, x, y) / cov >= 0.15) continue;
      var far = true;
      for (k = 0; k < avoid.length && far; k++) { var dx = x - avoid[k][0] * w, dy = y - avoid[k][1] * h; if (dx * dx + dy * dy < rr) far = false; }
      if (!far) continue;
      var sc = box(Ig, x, y) / cov; if (sc > best) { best = sc; bx = x; by = y; }
    }
    // порог выведен для 400 px по большей стороне (оценка обратно пропорциональна размеру)
    if (best < 0 || best * M / 400 < 0.03) return null;
    return [+(bx / w).toFixed(4), +(by / h).toFixed(4)];
  }
  /* точки «грань / основание / фактура» по маске изделия a (0..1, w×h) — запасной вариант к variants.json;
     d — пиксели RGBA того же размера (для выбора «фактуры» по резьбе) */
  function focusFromMask(a, w, h, d) {
    var x0 = w, y0 = h, x1 = -1, y1 = -1, x, y, i;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (a[y * w + x] > 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    var bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0), best = [1e9, 0, 0], base = [-1e9, 0, 0];
    for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
      if (a[y * w + x] <= 0.5) continue;
      var xn = (x - x0) / bw, yn = (y - y0) / bh, s1 = (1 - xn) + yn, s2 = xn + yn;
      if (s1 < best[0]) best = [s1, x, y];
      if (s2 > base[0]) base = [s2, x, y];
    }
    var q = function (v, n) { return +(v / n).toFixed(4); };
    var tp = d && d.length >= w * h * 4 ? texturePoint(d, a, w, h, [[best[1] / w, best[2] / h], [base[1] / w, base[2] / h]]) : null;
    if (tp) return [q(best[1], w), q(best[2], h), q(base[1], w), q(base[2], h), tp[0], tp[1]];
    // фактура — самая «глубокая» точка изделия в верхних 60% (дальше всего от края)
    var lim = y0 + Math.round(bh * 0.6), tex = [-1, (x0 + x1) / 2, y0 + bh * 0.35], step = Math.max(1, Math.round(Math.max(bw, bh) / 60));
    for (y = y0; y <= lim; y += step) for (x = x0; x <= x1; x += step) {
      if (a[y * w + x] <= 0.5) continue;
      var r = 1, ok = true;
      while (ok && r < Math.max(bw, bh)) {
        for (i = 0; i < 8 && ok; i++) {
          var xx = Math.round(x + r * Math.cos(i * Math.PI / 4)), yy = Math.round(y + r * Math.sin(i * Math.PI / 4));
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || a[yy * w + xx] <= 0.5) ok = false;
        }
        if (ok) r += step;
      }
      if (r > tex[0]) tex = [r, x, y];
    }
    return [q(best[1], w), q(best[2], h), q(base[1], w), q(base[2], h), q(tex[1], w), q(tex[2], h)];
  }

  // линза смотрит чуть внутрь изделия от крайней точки — в круге и грань, и камень
  var AIM = { corner: [-1, 1], base: [-1, -1], texture: [0, 0] };
  function aim(key, f, Z, ar) {
    var s = AIM[key] || [0, 0], k = 0.26;
    return [clamp(f[0] + s[0] * k / Z, 0, 1), clamp(f[1] + s[1] * k * (ar || 1) / Z, 0, 1)];
  }
  // фото без точек в variants.json (загружено в админке): маска изделия по фону;
  // тень и светлые края не считаем изделием, если тёмного камня на фото достаточно
  function focusFromPixels(d, w, h) {
    var mk = studioMask(d, w, h); if (!mk.ok) return null;
    var n = w * h, strict = new Float32Array(n), cs = 0, cl = 0, i;
    for (i = 0; i < n; i++) if (mk.a[i] > 0.5) { cl++; if (dist(d, i * 4, mk.bg) > 180) { strict[i] = 1; cs++; } }
    return focusFromMask(cs >= cl * 0.3 ? strict : mk.a, w, h, d);
  }

  /* ---------- «студия» в админке: однотонный фон → прозрачность, кадр раздела, мягкая тень ---------- */
  function dist(d, o, c) { var a = d[o] - c[0], b = d[o + 1] - c[1], e = d[o + 2] - c[2]; return Math.sqrt(a * a * 0.3 + b * b * 0.59 + e * e * 0.11) * 1.6; }
  // d — RGBA w×h (уменьшенная копия). Возвращает маску изделия или ok:false, если фон неоднородный
  function studioMask(d, w, h) {
    var n = w * h, ring = [], x, y, i;
    for (x = 0; x < w; x++) { ring.push(x); ring.push((h - 1) * w + x); }
    for (y = 1; y < h - 1; y++) { ring.push(y * w); ring.push(y * w + w - 1); }
    var ch = [[], [], []];
    ring.forEach(function (p) { var o = p * 4; ch[0].push(d[o]); ch[1].push(d[o + 1]); ch[2].push(d[o + 2]); });
    var bg = ch.map(function (v) { v.sort(function (a, b) { return a - b; }); return v[v.length >> 1]; });
    var near = 0; ring.forEach(function (p) { if (dist(d, p * 4, bg) < 30) near++; });
    var share = near / ring.length;
    if (share < 0.55) return { ok: false, reason: 'busy', share: share, bg: bg };
    // заливка фона от краёв кадра: близко к цвету фона или плавный переход (виньетка)
    var reach = new Uint8Array(n), st = new Int32Array(n), sp = 0, T1 = 30, T2 = 78, TL = 7;
    function tryPush(p, from) {
      if (reach[p]) return;
      var o = p * 4, dg = dist(d, o, bg);
      if (dg < T1 || (from >= 0 && dg < T2 && dist(d, o, [d[from * 4], d[from * 4 + 1], d[from * 4 + 2]]) < TL)) { reach[p] = 1; st[sp++] = p; }
    }
    ring.forEach(function (p) { tryPush(p, -1); });
    while (sp) {
      var p = st[--sp]; x = p % w;
      if (x > 0) tryPush(p - 1, p); if (x < w - 1) tryPush(p + 1, p);
      if (p >= w) tryPush(p - w, p); if (p < n - w) tryPush(p + w, p);
    }
    // альфа: фон 0; внутри — 1, кроме «дыр» цвета фона (просветы ограды); мягкий край по цвету
    var a = new Float32Array(n), cnt = 0;
    for (i = 0; i < n; i++) {
      var dg2 = dist(d, i * 4, bg);
      if (reach[i]) a[i] = 0;
      else a[i] = dg2 >= T1 ? 1 : clamp((dg2 - T1 * 0.45) / (T1 * 0.55), 0, 1);
      if (a[i] > 0.5) cnt++;
    }
    // край: пиксели фона рядом с изделием получают долю альфы по удалённости от цвета фона (сглаживание)
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = y * w + x; if (!reach[i]) continue;
      if (a[i - 1] > 0.5 || a[i + 1] > 0.5 || a[i - w] > 0.5 || a[i + w] > 0.5) a[i] = Math.max(a[i], clamp((dist(d, i * 4, bg) - 8) / 40, 0, 0.8));
    }
    if (cnt < n * 0.004) return { ok: false, reason: 'empty', share: share, bg: bg };
    if (cnt > n * 0.97) return { ok: false, reason: 'full', share: share, bg: bg };
    // рамка изделия без случайных точек: строки/столбцы, где изделия больше 0,15%
    var rows = new Uint32Array(h), cols = new Uint32Array(w);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (a[y * w + x] > 0.5) { rows[y]++; cols[x]++; }
    var lim = function (arr, len, other) { var t = Math.max(1, other * 0.0015), s = 0, e = len - 1; while (s < len && arr[s] < t) s++; while (e > s && arr[e] < t) e--; return [s, e]; };
    var rx = lim(cols, w, h), ry = lim(rows, h, w);
    // край кадра режет изделие, только если по краю идёт длинный срез (≥ 6% размера изделия), а не кончик угла
    var bw = rx[1] - rx[0] + 1, bh = ry[1] - ry[0] + 1, cl = 0, cr = 0, ct = 0, cb = 0;
    for (y = 0; y < h; y++) { if (a[y * w] > 0.5 || a[y * w + 1] > 0.5) cl++; if (a[y * w + w - 1] > 0.5 || a[y * w + w - 2] > 0.5) cr++; }
    for (x = 0; x < w; x++) { if (a[x] > 0.5 || a[w + x] > 0.5) ct++; if (a[(h - 1) * w + x] > 0.5 || a[(h - 2) * w + x] > 0.5) cb++; }
    return { ok: true, a: a, bg: bg, share: share, bbox: [rx[0], ry[0], rx[1] + 1, ry[1] + 1],
      touch: { l: cl >= bh * 0.06, r: cr >= bh * 0.06, t: ct >= bw * 0.06, b: cb >= bw * 0.06 } };
  }
  // размещение в кадре раздела: bbox в пикселях исходника (sw×sh) → масштаб и сдвиг на холсте W×H
  function studioLayout(bbox, sw, sh, frameName, maxL, touch) {
    var F = FRAMES[frameName] || FRAMES.square, L = maxL || 2400;
    var W = F.ar >= 1 ? L : Math.round(L * F.ar), H = F.ar >= 1 ? Math.round(L / F.ar) : L;
    var bw = Math.max(1, bbox[2] - bbox[0]), bh = Math.max(1, bbox[3] - bbox[1]);
    var k = Math.min(F.mw * W / bw, F.mh * H / bh);
    // фото мелкое — уменьшаем холст, чтобы не растягивать изделие больше чем в 1,25 раза
    if (k > 1.25) { var s = Math.max(1200 / L, 1.25 / k); W = Math.round(W * s); H = Math.round(H * s); k *= s; }
    // срезы — как place() в tools/media/studio.py: изделие уходит за обрезанный край кадра
    var t = touch || {}, bleed = !!(t.b && DEPTH_FRAME[frameName]), x, y;
    function set(kk, ax) { k = kk; x = ax === 'l' ? 0 : ax === 'r' ? W - bw * k : (W - bw * k) / 2; y = F.floor * H - bh * k; }
    set(k);
    if (t.l && t.r) set(W / bw, 'l');                                                   // срез с обеих сторон — во всю ширину
    else if (t.l || t.r) set(Math.min(1.06 * F.mw * W / bw, F.mh * H / bh), t.l ? 'l' : 'r'); // с одной — прижато к срезу
    if (bleed) {                                                                         // комплекс / ограда обрезаны снизу
      if (!(t.l || t.r)) set(Math.min(F.mw * W / bw, 0.9 * H / bh));
      y = H - bh * k;
    }
    if (t.t && !bleed) y = 0;                                                            // срез сверху — от верхнего края кадра
    // верхнее поле не меньше 4% (кроме среза сверху и изделий во всю ширину): уменьшаем, основание на месте
    if (!t.t && !(t.l && t.r) && y < H * 0.04) {
      var bot = y + bh * k, k2 = k * (bot - H * 0.04) / Math.max(1, bh * k);
      x = t.l ? 0 : t.r ? W - bw * k2 : x + bw * (k - k2) / 2; y = bot - bh * k2; k = k2;
    }
    var ow = bw * k, oh = bh * k;
    return { W: W, H: H, k: k, x: x - bbox[0] * k, y: y - bbox[1] * k, ox: x, oy: y, ow: ow, oh: oh, floor: Math.min(H, y + oh) };
  }
  var DEPTH_FRAME = { square: 1, wide: 1 };

  /* ---------- настройки вида каталога (админка → Каталог → «Вид каталога») ---------- */
  var LOOK = { frames: true, motion: 'full', details: true, stage: 'warm' };
  function look(K) {
    var l = (K && K.look) || {};
    return { frames: l.frames !== false, motion: l.motion === 'soft' || l.motion === 'off' ? l.motion : 'full', details: l.details !== false, stage: l.stage === 'white' ? 'white' : 'warm' };
  }
  function applyLook(K, el) {
    var L = look(K); el = el || (typeof document !== 'undefined' && document.documentElement);
    if (!el || !el.classList) return L;
    el.classList.toggle('lx-noframe', !L.frames); el.classList.toggle('lx-soft', L.motion === 'soft');
    el.classList.toggle('lx-still', L.motion === 'off'); el.classList.toggle('lx-nodet', !L.details); el.classList.toggle('lx-white', L.stage === 'white');
    return L;
  }

  /* ---------- появление: рамка рисуется, когда карточка входит в экран ---------- */
  var IO = null;
  function reveal(root) {
    if (typeof document === 'undefined') return;
    var els = (root || document).querySelectorAll('.lx:not(.lx-in)'), still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window) || still || document.documentElement.classList.contains('lx-still')) { [].forEach.call(els, function (e) { e.classList.add('lx-in'); }); return; }
    document.documentElement.classList.add('lx-js');
    if (!IO) IO = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('lx-in'); IO.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    [].forEach.call(els, function (e) { IO.observe(e); });
  }

  return { V: V, VA: VA, COVERS: COVERS, FRAMES: FRAMES, CAT_FRAME: CAT_FRAME, DEPTH: DEPTH, DETAILS: DETAILS, LOOK: LOOK,
    code: code, acc: acc, isStudio: isStudio, url: url, sized: sized, cover: cover, frameOf: frameOf, stageAr: stageAr,
    frame: frame, glint: glint, rule: rule, go: go, sketch: sketch, lens: lens, lensCenter: lensCenter, focusList: focusList, aim: aim,
    focusFromMask: focusFromMask, focusFromPixels: focusFromPixels, texturePoint: texturePoint, studioMask: studioMask, studioLayout: studioLayout, look: look, applyLook: applyLook, reveal: reveal };
});
