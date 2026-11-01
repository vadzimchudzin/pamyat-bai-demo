/* ПАМЯТЬ.БАЙ — админка: калькулятор (базовая точка, расчёт по размеру участка, график кривой цен).
   Формулы — в общем модуле js/pricing.js; здесь только редактор. Подключается после admin.js. */
(function () {
  'use strict';
  var K = window.AdminKit, PP = window.PamyatPricing;
  var $ = K.$, $$ = K.$$, esc = K.esc, toast = K.toast, slug = K.slug, field = K.field;
  function content() { return K.content(); }
  function setCalc(v) { content().calc = v; }
  function calcDimensionsConfig() {
    var d = content().calc && content().calc.dimensions || {};
    return {
      enabled: d.enabled !== false,
      name: d.name || 'Размеры',
      sub: d.sub || 'Укажите длину и ширину участка. Это необязательно — без размеров расчёт останется по базовым ценам.',
      unit: d.unit || 'м',
      min: Number.isFinite(+d.min) && +d.min > 0 ? +d.min : 0.1,
      max: Number.isFinite(+d.max) && +d.max > 0 ? +d.max : 100,
      step: Number.isFinite(+d.step) && +d.step > 0 ? +d.step : 0.1,
      allowSkip: d.allowSkip !== false
    };
  }
    var chartMetric = 'total', chartRange = 4;           // chartRange — во сколько раз площадь справа больше базовой           // общие настройки всех графиков
  var MEASURES = [
    ['area', 'Площадь участка (м²)'], ['perimeter', 'Периметр участка (м.п.)'], ['halfPerimeter', 'Половина периметра (м.п.)'],
    ['length', 'Длина участка (м.п.)'], ['width', 'Ширина участка (м.п.)']
  ];
  var ROUNDS = [[0.01, 'до копеек'], [1, 'до 1 BYN'], [5, 'до 5 BYN'], [10, 'до 10 BYN']];
  function f2(n) { return PP.fmt(n); }
  function money(n) { return PP.fmt(n) + ' BYN'; }
  function plain(n) { return String(Math.round(Number(n) * 10000) / 10000); }
  function numField(name, label, value, step, min, max) {
    return '<label>' + label + '<input name="' + name + '" type="number" step="' + step + '" min="' + min + '"' +
      (max == null ? '' : ' max="' + max + '"') + ' value="' + esc(value) + '"></label>';
  }
  function nf(name, label, value, hint, attrs) {
    return '<label class="nf"><span>' + label + '</span><input name="' + name + '" type="number" step="any" min="0" value="' + esc(plain(value)) + '"' + (attrs || '') + '>' +
      (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  }
  function drawCalcDimensions() {
    var d = calcDimensionsConfig();
    $('#calcDimensionsEd').innerHTML =
      '<div class="calc-admin-head"><div><b>Шаг 2 — размеры участка</b><p class="hint">Шаг автоматически добавляется сразу после выбора памятника. Клиент может его пропустить; без размеров считается цена базового участка.</p></div>' +
      '<label class="chk"><input type="checkbox" name="dimensionsEnabled"' + (d.enabled ? ' checked' : '') + '> Показывать шаг размеров</label></div>' +
      '<div class="calc-dim-grid">' +
      '<label>Название шага<input name="dimensionsName" value="' + esc(d.name) + '"></label>' +
      '<label>Единица измерения<input value="м — метры" disabled></label>' +
      '<label class="wide">Подсказка пользователю<input name="dimensionsSub" value="' + esc(d.sub) + '"></label>' +
      numField('dimensionsMin', 'Минимальный размер', d.min, '0.01', '0.01') +
      numField('dimensionsMax', 'Максимальный размер', d.max, '0.1', '0.1') +
      numField('dimensionsStep', 'Шаг ввода', d.step, '0.01', '0.01') +
      '<label class="chk"><input type="checkbox" name="dimensionsAllowSkip"' + (d.allowSkip ? ' checked' : '') + '> Разрешить пропуск шага</label>' +
      '</div>';
  }

  /* ----- базовый участок ----- */
  function readBase() {
    var b = $('#calcBaseEd');
    if (!b || !$('[name=blen]', b)) return PP.normalizeBase(content().calc && content().calc.base);
    return PP.normalizeBase({
      length: String($('[name=blen]', b).value).replace(',', '.'),
      width: String($('[name=bwid]', b).value).replace(',', '.'),
      round: $('[name=bround]', b).value
    });
  }
  function drawCalcBase() {
    var b = PP.normalizeBase(content().calc && content().calc.base);
    $('#calcBaseEd').innerHTML =
      '<div class="calc-admin-head"><div><b>Базовая точка калькулятора</b>' +
      '<p class="hint">Участок, для которого вы задаёте «эталонные» цены. Все кривые на графиках строятся относительно него: форма участка сохраняется, меняется только масштаб. Если клиент не ввёл размеры — он увидит цену именно этого участка.</p></div></div>' +
      '<div class="base-grid">' +
      '<label class="nf"><span>Длина, м</span><input name="blen" type="number" step="any" min="0.01" value="' + plain(b.length) + '"></label>' +
      '<label class="nf"><span>Ширина, м</span><input name="bwid" type="number" step="any" min="0.01" value="' + plain(b.width) + '"></label>' +
      '<label class="nf"><span>Округлять итоговую цену</span><select name="bround">' + ROUNDS.map(function (r) {
        return '<option value="' + r[0] + '"' + (Math.abs(r[0] - b.round) < 1e-9 ? ' selected' : '') + '>' + r[1] + '</option>';
      }).join('') + '</select></label>' +
      '<div class="base-facts" data-basefacts></div></div>' +
      '<details class="calc-help"><summary>Как считается цена — простыми словами</summary><ol>' +
      '<li><b>Постоянные затраты</b> — то, что вы тратите на работу независимо от размера: топливо, генератор, рабочие, поездка, клей, СВП. Они одинаковы и для маленького, и для большого участка.</li>' +
      '<li><b>Затраты на единицу</b> — то, что растёт вместе с участком: бетон, арматура, плитка. Умножаются на размер (м² или м.п.).</li>' +
      '<li><b>Подрезка плитки</b> (по желанию) — программа раскладывает плитку на участке и считает отход и метры реза. Если плитка ложится ровно, подрезки нет.</li>' +
      '<li><b>Себестоимость</b> = постоянные + на единицу × размер + подрезка.</li>' +
      '<li><b>Резерв, %</b> — запас на непредвиденное: прибавляется к себестоимости.</li>' +
      '<li><b>Наценка (×)</b> — множитель к себестоимости с резервом. ×2,5 означает: цена в 2,5 раза выше затрат; маржа = 1 − 1/2,5 = 60%.</li>' +
      '<li><b>Минимальная сумма</b> — цена не опустится ниже неё даже на самом маленьком участке.</li>' +
      '<li><b>Цена за м² падает с ростом участка</b> — потому что постоянные затраты «размазываются» по большей площади. Общая цена при этом всегда растёт.</li>' +
      '<li><b>Подобрать наценку</b> — введите желаемую цену в базовой точке, и наценка подберётся сама.</li>' +
      '</ol></details>';
    updateBaseFacts();
  }
  function updateBaseFacts() {
    var box = $('[data-basefacts]'); if (!box) return;
    var b = readBase(), d = PP.dimsOf(b.length, b.width);
    box.innerHTML = '<span>Площадь: <b>' + f2(d.area) + ' м²</b></span><span>Периметр: <b>' + f2(d.perimeter) + ' м.п.</b></span>';
  }

  /* ----- модель позиции для формы ----- */
  function formModel(it) {
    var p = PP.normalizePricing(it);
    if (p.mode === 'fixed') return { mode: 'fixed' };
    var tr = { enabled: false, tileA: 60, tileB: 50, material: 0, cut: 0 };
    if (p.mode === 'curve') {
      var n = PP.normalizeCurve(it.pricing && it.pricing.curve), cs = n.costs || { fixed: 0, unit: 0, reserve: 0, markup: 1 };
      return { mode: 'curve', quantity: p.quantity, share: n.share * 100, piece: n.piece, costFixed: cs.fixed, costUnit: cs.unit,
        reserve: cs.reserve * 100, markup: cs.markup, min: n.min, trim: n.trim };
    }
    // старая схема «за м² / за м.п.» → показываем как кривую без постоянных затрат и наценки (цена та же)
    return { mode: 'curve', converted: true, droppedK: p.coefficient.enabled, quantity: p.mode === 'area' ? 'area' : (p.quantity === 'unit' ? 'perimeter' : p.quantity),
      share: 100, piece: 0, costFixed: 0, costUnit: it.price == null ? 0 : it.price, reserve: 0, markup: 1, min: 0, trim: tr };
  }
  function unitOf(q) { return q === 'area' ? 'м²' : 'м.п.'; }

  function curvePanel(m) {
    var u = unitOf(m.quantity), t = m.trim, area = m.quantity === 'area';
    return '<div class="curve-panel">' +
      (m.converted ? '<div class="curve-warn">Позиция была настроена по старой схеме («за ' + (m.quantity === 'area' ? 'м²' : 'пог. метр') + '»). Она автоматически показана в новой схеме с той же ценой ' +
        '(постоянных затрат нет, наценка ×1)' + (m.droppedK ? '. <b>Старый «коэффициент смещения» не переносится</b> — вместо него задайте постоянные затраты и наценку' : '') +
        '. Нажмите «Сохранить», чтобы применить.</div>' : '') +
      '<div class="curve-grid">' +
      '<fieldset><legend>1. Что считаем</legend>' +
      '<label class="nf"><span>Что измеряем</span><select name="cq">' + MEASURES.map(function (x) {
        return '<option value="' + x[0] + '"' + (m.quantity === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select><small>От чего зависит количество работ</small></label>' +
      nf('cshare', 'Доля от измерения, %', m.share, 'Например, бордюр только по двум сторонам — 50%', ' max="100" min="1"') +
      nf('cpiece', 'Продаётся кратно, м', m.piece, '0 — не округлять. Иначе количество округляется вверх до целых элементов') +
      '</fieldset>' +
      '<fieldset><legend>2. Затраты (себестоимость), BYN</legend>' +
      nf('cfix', 'Постоянные затраты', m.costFixed, 'Не зависят от размера: топливо, рабочие, поездка…') +
      nf('cunit', 'Затраты за 1 ' + u, m.costUnit, 'Растут с размером: материалы на ' + u) +
      nf('cres', 'Резерв, %', m.reserve, 'Запас на непредвиденное, прибавляется к затратам') +
      '</fieldset>' +
      '<fieldset><legend>3. Цена для клиента</legend>' +
      nf('cmk', 'Наценка, ×', m.markup, 'Цена = затраты с резервом × наценка', ' min="0.01"') +
      nf('cmin', 'Минимальная сумма, BYN', m.min, '0 — без минимума') +
      '<div class="fit"><label class="nf"><span>Желаемая цена в базовой точке</span><input name="ctarget" type="number" step="any" min="0" placeholder="например, 2250"></label>' +
      '<button type="button" class="btn line sm" data-act="k-fit">Подобрать наценку</button></div>' +
      '</fieldset>' +
      '<fieldset class="trim-set' + (area ? '' : ' off') + '"><legend>4. Подрезка плитки</legend>' +
      '<label class="chk"><input type="checkbox" name="ctrim"' + (t.enabled && area ? ' checked' : '') + (area ? '' : ' disabled') + '> Считать подрезку плитки</label>' +
      (area ? '' : '<p class="hint">Доступно, когда измеряется площадь.</p>') +
      '<div class="trim-grid">' +
      nf('ctA', 'Плитка: сторона A, см', t.tileA, '', area && t.enabled ? '' : ' disabled') +
      nf('ctB', 'Плитка: сторона B, см', t.tileB, '', area && t.enabled ? '' : ' disabled') +
      nf('cmat', 'Плитка, BYN за м²', t.material, 'Стоимость отходящей плитки', area && t.enabled ? '' : ' disabled') +
      nf('ccut', 'Рез, BYN за м.п.', t.cut, 'Стоимость 1 метра реза', area && t.enabled ? '' : ' disabled') +
      '</div></fieldset></div>' +
      '<div class="curve-out"></div></div>';
  }

  function itemHTML(it, ii) {
    var m = formModel(it), curve = m.mode === 'curve';
    return '<div class="it calc-it' + (curve ? ' is-curve' : '') + '" data-ii="' + ii + '" data-id="' + esc(it.id) + '">' +
      '<div class="it-main">' +
      '<input name="iname" value="' + esc(it.name) + '" placeholder="Название">' +
      (curve ? '<input name="iprice" class="calc-price-ro" readonly tabindex="-1" title="Цена в базовой точке — считается автоматически" value="">'
        : '<input name="iprice" type="number" min="0" step="0.01" value="' + (it.price == null ? '' : it.price) + '" placeholder="инд. расчёт">') +
      '<input name="inote" value="' + esc(it.note || '') + '" placeholder="Подпись / примечание">' +
      '<select name="pmode" aria-label="Тип тарификации"><option value="fixed"' + (!curve ? ' selected' : '') + '>Фиксированная</option><option value="curve"' + (curve ? ' selected' : '') + '>По размеру (кривая)</option></select>' +
      '<div class="tools"><button class="ic" data-act="i-up" title="Выше">↑</button><button class="ic" data-act="i-down" title="Ниже">↓</button><button class="ic del" data-act="i-del" title="Удалить">✕</button></div>' +
      '</div>' + (curve ? curvePanel(m) : '') + '</div>';
  }

  function drawCalc() {
    var steps = ((content().calc && content().calc.steps) || []).filter(function (s) { return s.id !== 'monument'; });
    drawCalcBase();
    drawCalcDimensions();
    $('#calcEd').innerHTML = steps.map(function (s, si) {
      return '<div class="card step" data-si="' + si + '" data-id="' + esc(s.id) + '">' +
        '<div class="step-head">' + field('name', 'Шаг ' + (si + 1) + ' — название вкладки', s.name) + field('sub', 'Подсказка под заголовком', s.sub) +
        '<label>Выбор<select name="type"><option value="radio"' + (s.type !== 'multi' ? ' selected' : '') + '>Один вариант</option><option value="multi"' + (s.type === 'multi' ? ' selected' : '') + '>Несколько</option></select></label>' +
        '<div class="tools"><button class="ic" data-act="s-up" title="Выше">↑</button><button class="ic" data-act="s-down" title="Ниже">↓</button><button class="ic del" data-act="s-del" title="Удалить шаг">✕</button></div></div>' +
        '<div class="colh calc-colh"><span>Позиция</span><span>Цена в базовой точке, BYN</span><span>Подпись</span><span>Тарификация</span><span></span></div>' +
        '<div class="items">' + (s.items || []).map(itemHTML).join('') + '</div>' +
        '<button class="btn line sm" data-act="i-add" style="margin-top:12px">+ Позиция</button></div>';
    }).join('') || '<p class="empty">Шагов нет — добавьте первый.</p>';
    refreshAllCurves();
  }

  /* ----- чтение позиции из формы ----- */
  function readItem(row, base) {
    base = base || readBase();
    var g = function (n) { var e = $('[name=' + n + ']', row); return e ? e.value : ''; };
    var n = function (x, d) { var v = parseFloat(String(g(x)).replace(',', '.')); return isFinite(v) ? v : d; };
    var mode = g('pmode') === 'curve' ? 'curve' : 'fixed';
    var out = { id: row.dataset.id, name: g('iname').trim() || 'Позиция', note: g('inote').trim() || undefined };
    if (mode !== 'curve') {
      var p = g('iprice').trim();
      out.price = p === '' ? null : Math.max(0, Math.round(+p * 100) / 100);
      out.pricing = { mode: 'fixed' };
      return out;
    }
    var bd = PP.dimsOf(base.length, base.width);
    if (!$('[name=cq]', row)) {            // позиция только что переключена с «фиксированной»: сохраняем её цену в базовой точке
      var P = parseFloat(g('iprice')) || 0;
      out.pricing = { mode: 'curve', quantity: 'area', curve: { share: 1, piece: 0, costFixed: 0, costUnit: P / bd.area, reserve: 0, markup: 1, min: 0,
        trim: { enabled: false, tileA: 60, tileB: 50, material: 0, cut: 0 } } };
    } else {
      var trimBox = $('[name=ctrim]', row);
      out.pricing = { mode: 'curve', quantity: g('cq') || 'area', curve: {
        share: Math.min(100, Math.max(1, n('cshare', 100))) / 100, piece: Math.max(0, n('cpiece', 0)),
        costFixed: Math.max(0, n('cfix', 0)), costUnit: Math.max(0, n('cunit', 0)), reserve: Math.max(0, n('cres', 0)),
        markup: n('cmk', 1) > 0 ? n('cmk', 1) : 1, min: Math.max(0, n('cmin', 0)),
        trim: { enabled: !!(trimBox && trimBox.checked && !trimBox.disabled), tileA: Math.max(1, n('ctA', 60)), tileB: Math.max(1, n('ctB', 50)),
          material: Math.max(0, n('cmat', 0)), cut: Math.max(0, n('ccut', 0)) } } };
    }
    var a = PP.analyzeAt(out, bd, { base: base });
    out.price = a ? PP.roundMoney(a.price) : 0;
    return out;
  }

  /* ----- график ----- */
  function niceStep(max, ticks) {
    var raw = max / ticks, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  }
  function chartHTML(it, base, bd) {
    var pts = PP.curvePoints(it, { base: base }, 0.5, Math.sqrt(chartRange), 140);
    if (!pts.length) return { html: '', pts: [] };
    var per = chartMetric === 'perm2';
    var val = function (p) { return per ? p.perM2 : p.price; };
    var cst = function (p) { return p.cost == null ? null : (per ? p.cost / p.area : p.cost); };
    var W = 720, H = 300, ml = 58, mr = 18, mt = 22, mb = 42;
    var x0 = pts[0].area, x1 = pts[pts.length - 1].area, ymax = 0;
    pts.forEach(function (p) { ymax = Math.max(ymax, val(p) || 0, cst(p) || 0); });
    ymax = ymax > 0 ? ymax * 1.1 : 1;
    var ys = niceStep(ymax, 5), ytop = Math.ceil(ymax / ys) * ys;
    var X = function (a) { return ml + (a - x0) / (x1 - x0) * (W - ml - mr); };
    var Y = function (v) { return H - mb - v / ytop * (H - mt - mb); };
    var path = function (fn) {
      var d = '', started = false;
      pts.forEach(function (p) { var v = fn(p); if (v == null) return; d += (started ? 'L' : 'M') + X(p.area).toFixed(1) + ' ' + Y(v).toFixed(1); started = true; });
      return d;
    };
    var grid = '', xt = niceStep(x1 - x0, 7), v;
    for (v = 0; v <= ytop + 1e-9; v += ys) grid += '<line class="gl" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="ax" x="' + (ml - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + f2(v) + '</text>';
    for (v = Math.ceil(x0 / xt) * xt; v <= x1 + 1e-9; v += xt) grid += '<line class="gl v" x1="' + X(v).toFixed(1) + '" x2="' + X(v).toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"/><text class="ax" x="' + X(v).toFixed(1) + '" y="' + (H - mb + 17) + '" text-anchor="middle">' + f2(v) + '</text>';
    var ba = PP.analyzeAt(it, bd, { base: base }), bx = X(bd.area), byv = Y(per ? ba.perM2 : ba.price);
    var label = 'База ' + f2(base.length) + '×' + f2(base.width) + ' м → ' + f2(per ? ba.perM2 : ba.price) + (per ? ' BYN/м²' : ' BYN');
    var anchor = bx > W * 0.62 ? 'end' : 'start', lx = anchor === 'end' ? bx - 10 : bx + 10;
    var hasCost = pts[0].cost != null;
    var html = '<svg class="curve-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="График цены от площади участка">' + grid +
      '<line class="axis" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (H - mb) + '" y2="' + (H - mb) + '"/>' +
      '<text class="axt" x="' + ((ml + W - mr) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Площадь участка, м² (форма как у базового, масштаб ×' + f2(0.3) + '…×' + f2(chartRange) + ' по сторонам)</text>' +
      (hasCost ? '<path class="cost" d="' + path(cst) + '"/>' : '') +
      '<path class="price" d="' + path(val) + '"/>' +
      '<line class="basel" x1="' + bx.toFixed(1) + '" x2="' + bx.toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"/>' +
      '<circle class="basep" cx="' + bx.toFixed(1) + '" cy="' + byv.toFixed(1) + '" r="6"/>' +
      '<text class="basetx" x="' + lx.toFixed(1) + '" y="' + Math.max(mt + 4, byv - 12).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(label) + '</text>' +
      '<g class="hv" visibility="hidden"><line x1="0" x2="0" y1="' + mt + '" y2="' + (H - mb) + '"/><circle r="4.5" cx="0" cy="0"/></g>' +
      '<rect class="hit" x="' + ml + '" y="' + mt + '" width="' + (W - ml - mr) + '" height="' + (H - mt - mb) + '"/></svg>';
    return { html: html, pts: pts, geo: { ml: ml, mr: mr, W: W, x0: x0, x1: x1, Y: Y, X: X, val: val }, hasCost: hasCost };
  }

  function sizeTable(it, base) {
    var rows = [0.4, 0.6, 0.8, 1, 1.3, 1.7, 2.2, 3].map(function (s) {
      var d = PP.dimsOf(base.length * s, base.width * s), a = PP.analyzeAt(it, d, { base: base });
      return '<tr' + (s === 1 ? ' class="base"' : '') + '><td>' + f2(d.length) + ' × ' + f2(d.width) + (s === 1 ? ' <i>база</i>' : '') + '</td><td>' + f2(d.area) + '</td><td><b>' + f2(a.price) + '</b></td><td>' + f2(a.perM2) + '</td><td>' +
        (a.cost == null ? '—' : f2(a.cost) + '</td><td>' + Math.round(a.margin * 100) + '%') + '</td></tr>';
    }).join('');
    return '<table class="size-table"><thead><tr><th>Участок, м</th><th>м²</th><th>Цена, BYN</th><th>BYN/м²</th><th>Затраты, BYN</th><th>Маржа</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function breakdownHTML(it, base, bd) {
    var a = PP.analyzeAt(it, bd, { base: base }), ev = a.eval, c = ev.cost, p = PP.normalizePricing(it), cv = p.curve, u = unitOf(p.quantity);
    if (!c) return '';
    var full = PP.measureValue(p.quantity, bd), qtxt = f2(full) + ' ' + u;
    if (cv.share < 1) qtxt += ' × ' + f2(cv.share * 100) + '%';
    if (cv.piece > 0) qtxt += ' → округлено вверх до ' + f2(ev.quantity) + ' ' + u + ' (кратно ' + f2(cv.piece) + ')';
    else if (cv.share < 1) qtxt += ' = ' + f2(ev.quantity) + ' ' + u;
    var rows = [
      ['Размер участка (база)', f2(base.length) + ' × ' + f2(base.width) + ' м', 'площадь ' + f2(bd.area) + ' м², периметр ' + f2(bd.perimeter) + ' м.п.', ''],
      ['Количество', qtxt, '', ''],
      ['Постоянные затраты', 'не зависят от размера', '', money(c.fixed)],
      ['Затраты на размер', f2(c.variableRate) + ' BYN × ' + f2(ev.quantity) + ' ' + u, '', money(c.variable)]
    ];
    if (ev.trim) {
      rows.push(['Подрезка плитки: отход', f2(ev.trim.wasteArea) + ' м² × ' + f2(cv.trim.material) + ' BYN/м²', ev.trim.tiles + ' плиток, ' + (ev.trim.wasteArea > 0 ? 'есть отход' : 'ложатся без подрезки'), money(c.waste)]);
      rows.push(['Подрезка плитки: рез', f2(ev.trim.cutLen) + ' м.п. × ' + f2(cv.trim.cut) + ' BYN/м.п.', '', money(c.cut)]);
    }
    rows.push(['<b>Себестоимость</b>', '', '', '<b>' + money(c.subtotal) + '</b>']);
    rows.push(['Резерв ' + f2(c.total > c.subtotal ? c.reserve / c.subtotal * 100 : 0) + '%', 'запас на непредвиденное', '', money(c.reserve)]);
    rows.push(['<b>Себестоимость с резервом</b>', '', '', '<b>' + money(c.total) + '</b>']);
    rows.push(['Наценка ×' + f2(c.markup), money(c.total) + ' × ' + f2(c.markup), '', money(c.total * c.markup)]);
    if (ev.minApplied) rows.push(['Минимальная сумма', 'расчёт ниже минимума — берём ' + money(cv.min), '', money(cv.min)]);
    rows.push(['<b>Цена для клиента</b>', 'округление ' + (base.round >= 1 ? 'до ' + f2(base.round) + ' BYN' : 'до копеек'), '', '<b class="big">' + money(a.price) + '</b>']);
    rows.push(['Прибыль и маржа', 'прибыль = цена − себестоимость с резервом', 'за 1 м²: ' + f2(a.perM2) + ' BYN', money(a.profit) + ' · ' + Math.round(a.margin * 100) + '%']);
    return '<table class="bd-table"><tbody>' + rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td>' + r[1] + (r[2] ? '<small>' + r[2] + '</small>' : '') + '</td><td class="amt">' + r[3] + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function renderCurveOut(row) {
    var out = $('.curve-out', row); if (!out) return;
    var base = readBase(), bd = PP.dimsOf(base.length, base.width), it = readItem(row, base);
    if (it.pricing.mode !== 'curve') return;
    var priceBox = $('[name=iprice]', row); if (priceBox && priceBox.readOnly) priceBox.value = plain(it.price);
    var ch = chartHTML(it, base, bd);
    out.innerHTML =
      '<div class="curve-cols"><div class="curve-left"><h4>Расчёт для базового участка</h4>' + breakdownHTML(it, base, bd) + '</div>' +
      '<div class="curve-right"><div class="chart-bar"><h4>Кривая цен</h4><span class="seg" role="group">' +
      '<button type="button" data-metric="total" class="' + (chartMetric === 'total' ? 'on' : '') + '">Итоговая цена</button>' +
      '<button type="button" data-metric="perm2" class="' + (chartMetric === 'perm2' ? 'on' : '') + '">Цена за 1 м²</button></span>' +
      '<span class="seg" role="group">' + [2, 4, 9].map(function (r) { return '<button type="button" data-range="' + r + '" class="' + (chartRange === r ? 'on' : '') + '" title="Правый край графика: площадь в ' + r + ' раза больше базовой">до ×' + r + ' пл.</button>'; }).join('') + '</span></div>' +
      '<div class="chart-box">' + ch.html + '</div>' +
      '<div class="chart-legend"><span class="lg price">цена для клиента</span>' + (ch.hasCost ? '<span class="lg cost">затраты с резервом</span>' : '') + '<span class="lg base">базовая точка</span><span class="readout" data-readout>Наведите курсор на график — покажу цену для любого размера.</span></div></div></div>' +
      '<h4>Цены для разных размеров (форма как у базового участка)</h4><div class="tbl">' + sizeTable(it, base) + '</div>';
    var svg = $('.curve-svg', out);
    if (svg && ch.pts.length) bindChart(svg, ch, it, base, $('[data-readout]', out));
  }
  function bindChart(svg, ch, it, base, readout) {
    var g = ch.geo, hv = $('.hv', svg), hl = $('line', hv), hc = $('circle', hv);
    function move(e) {
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * g.W;
      var a = g.x0 + (x - g.ml) / (g.W - g.ml - g.mr) * (g.x1 - g.x0);
      var best = ch.pts[0];
      ch.pts.forEach(function (p) { if (Math.abs(p.area - a) < Math.abs(best.area - a)) best = p; });
      var px = g.X(best.area), py = g.Y(g.val(best));
      hv.setAttribute('visibility', 'visible'); hl.setAttribute('x1', px); hl.setAttribute('x2', px); hc.setAttribute('cx', px); hc.setAttribute('cy', py);
      var d = PP.dimsOf(base.length * best.s, base.width * best.s);
      readout.innerHTML = '<b>' + f2(d.length) + ' × ' + f2(d.width) + ' м</b> · ' + f2(best.area) + ' м² → <b>' + money(best.price) + '</b> · ' + f2(best.perM2) + ' BYN/м²' +
        (best.margin != null ? ' · маржа ' + Math.round(best.margin * 100) + '%' : '');
    }
    svg.addEventListener('mousemove', move);
    svg.addEventListener('touchmove', function (e) { if (e.touches[0]) move(e.touches[0]); }, { passive: true });
    svg.addEventListener('mouseleave', function () { hv.setAttribute('visibility', 'hidden'); });
  }
  function refreshAllCurves() { $$('#calcEd .calc-it.is-curve').forEach(renderCurveOut); }

  function readCalc() {
    var d = $('#calcDimensionsEd'), dims = {
      enabled: $('[name=dimensionsEnabled]', d).checked,
      name: $('[name=dimensionsName]', d).value.trim() || 'Размеры',
      sub: $('[name=dimensionsSub]', d).value.trim(),
      unit: 'м',
      min: Math.max(0.01, +$('[name=dimensionsMin]', d).value || 0.1),
      max: Math.max(0.01, +$('[name=dimensionsMax]', d).value || 100),
      step: Math.max(0.01, +$('[name=dimensionsStep]', d).value || 0.1),
      allowSkip: $('[name=dimensionsAllowSkip]', d).checked
    };
    if (dims.max < dims.min) dims.max = dims.min;
    var base = readBase();
    return { dimensions: dims, base: base, steps: $$('#calcEd .step').map(function (st) {
      return { id: st.dataset.id, name: $('[name=name]', st).value.trim() || 'Шаг', sub: $('[name=sub]', st).value.trim(), type: $('[name=type]', st).value,
        items: $$('.it', st).map(function (it) { return readItem(it, base); }).filter(function (x) { return x.name; }) };
    }) };
  }

  $('#calcEd').addEventListener('click', function (e) {
    var m = e.target.closest('[data-metric],[data-range]');
    if (m) {
      if (m.dataset.metric) chartMetric = m.dataset.metric; else chartRange = +m.dataset.range;
      refreshAllCurves(); return;
    }
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.dataset.act;
    if (a === 'k-fit') {
      var row = b.closest('.calc-it'), target = parseFloat($('[name=ctarget]', row).value);
      if (!(target > 0)) { toast('Введите желаемую цену в базовой точке', true); return; }
      var base = readBase(), it = readItem(row, base), p = PP.normalizePricing(it), cs = p.curve.costs;
      var bd = PP.dimsOf(base.length, base.width), ev = PP.analyzeAt(it, bd, { base: base }).eval;
      if (!cs || !(ev.cost.total > 0)) { toast('Сначала укажите затраты — иначе наценку не подобрать', true); return; }
      $('[name=cmk]', row).value = plain(target / ev.cost.total);
      renderCurveOut(row); toast('Наценка подобрана: ×' + f2(target / ev.cost.total));
      return;
    }
    var cal = readCalc(), st = b.closest('.step'), si = +st.dataset.si, it = b.closest('.it'), ii = it ? +it.dataset.ii : -1, arr = cal.steps;
    function mv(list, i, d) { var j = i + d; if (j < 0 || j >= list.length) return; var t = list[i]; list[i] = list[j]; list[j] = t; }
    if (a === 's-up') mv(arr, si, -1); if (a === 's-down') mv(arr, si, 1);
    if (a === 's-del' && confirm('Удалить шаг «' + arr[si].name + '»?')) arr.splice(si, 1);
    if (a === 'i-up') mv(arr[si].items, ii, -1); if (a === 'i-down') mv(arr[si].items, ii, 1);
    if (a === 'i-del') arr[si].items.splice(ii, 1);
    if (a === 'i-add') arr[si].items.push({ id: slug('item'), name: 'Новая позиция', price: 0, pricing: { mode: 'fixed' } });
    setCalc(cal); drawCalc();
  });
  $('#calcEd').addEventListener('input', function (e) {
    var row = e.target.closest && e.target.closest('.calc-it');
    if (row && row.classList.contains('is-curve') && e.target.name !== 'ctarget') renderCurveOut(row);
  });
  $('#calcEd').addEventListener('change', function (e) {
    var n = e.target && e.target.name;
    if (n === 'pmode' || n === 'cq' || n === 'ctrim') { var cal = readCalc(); setCalc(cal); drawCalc(); }
  });
  $('#calcBaseEd').addEventListener('input', function () { updateBaseFacts(); refreshAllCurves(); });
  $('#calcDimensionsEd').addEventListener('change', function (e) {
    if (e.target && e.target.name === 'dimensionsEnabled') {
      var d = readCalc(); setCalc(d); drawCalc();
    }
  });
  $('#addStep').addEventListener('click', function () {
    var cal = readCalc(); cal.steps.push({ id: slug('step'), name: 'Новый шаг', type: 'radio', sub: '', items: [{ id: slug('item'), name: 'Вариант', price: 0 }] });
    setCalc(cal); drawCalc();
  });

  window.AdminCalc = { draw: drawCalc, read: readCalc };
})();
