/* ПАМЯТЬ.БАЙ — админка: калькулятор (базовая точка, расчёт по размеру участка, график кривой цен).
   Формулы — в общем модуле js/pricing.js; здесь только редактор. Подключается после admin.js. */
(function () {
  'use strict';
  var K = window.AdminKit, PP = window.PamyatPricing, CF = window.PamyatCalcFlow;
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
  function nf(name, label, value, hint, attrs, digits) {
    var v = digits ? String(Math.round(Number(value) * Math.pow(10, digits)) / Math.pow(10, digits)) : plain(value);
    return '<label class="nf"><span>' + label + '</span><input name="' + name + '" type="number" step="any" min="0" value="' + esc(v) + '"' + (attrs || '') + '>' +
      (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  }
  /* ----- сценарий калькулятора: блоки «Памятник», «Размеры», шаги, «Контакты», панель итога ----- */
  function ui() {
    return CF ? CF.normalizeUi(content().calc) : { monument: {}, dimensions: {}, contact: {}, summary: {}, order: [] };
  }
  function presetsOf() {
    var d = content().calc && content().calc.dimensions || {};
    return (Array.isArray(d.presets) ? d.presets : []).map(function (p) { return Array.isArray(p) ? [+p[0], +p[1]] : [+(p && p.length), +(p && p.width)]; })
      .filter(function (p) { return p[0] > 0 && p[1] > 0; }).slice(0, 12);
  }
  function blockHead(num, title, opt) {
    opt = opt || {};
    return '<div class="blk-head"><span class="blk-n">' + num + '</span><b>' + esc(title) + '</b>' + (opt.tag ? '<span class="blk-tag">' + esc(opt.tag) + '</span>' : '') +
      '<div class="tools">' + (opt.toggle ? '<label class="chk blk-on"><input type="checkbox" name="' + opt.toggle + '"' + (opt.on ? ' checked' : '') + '> Показывать</label>' : '') +
      (opt.move === false ? '' : '<button class="ic" data-act="b-up" title="Выше">↑</button><button class="ic" data-act="b-down" title="Ниже">↓</button>') +
      (opt.del ? '<button class="ic del" data-act="s-del" title="Удалить шаг">✕</button>' : '') + '</div></div>';
  }
  function monumentCard(U, num) {
    var M = U.monument;
    return '<div class="card blk blk-mon' + (M.enabled ? '' : ' off') + '" data-key="@monument">' +
      blockHead(num, 'Памятник — выбор модели', { toggle: 'monEnabled', on: M.enabled, tag: 'варианты из «Каталога сайта»' }) +
      '<p class="hint">Варианты — разделы каталога с отметкой «в калькуляторе», цена «от» — из каталога. Посетитель может выбрать конкретную модель в каталоге; индивидуальный проект сразу ведёт к контактам.</p>' +
      '<div class="calc-dim-grid">' + field('monName', 'Название вкладки', M.name) + field('monPick', 'Ссылка «выбрать модель»', M.pick) + field('monPickOther', 'Ссылка, когда модель выбрана', M.pickOther) +
      field('monSub', 'Подсказка под заголовком', M.sub, { wide: true }) +
      field('monInd', 'Текст для индивидуального проекта', M.ind, { area: true, rows: 2, wide: true }) + field('monIndButton', 'Кнопка для индивидуального проекта', M.indButton) + '</div></div>';
  }
  function fmtM(v) { return String(Math.round(+v * 100) / 100).replace('.', ','); }
  function dimensionsCard(U, num) {
    var d = calcDimensionsConfig(), T = U.dimensions, P = presetsOf();
    return '<div class="card blk blk-dim' + (d.enabled ? '' : ' off') + '" data-key="@dimensions">' +
      blockHead(num, 'Размеры участка', { toggle: 'dimensionsEnabled', on: d.enabled, tag: 'необязательный шаг' }) +
      '<p class="hint">Длина и ширина участка. По ним пересчитываются позиции «за м² / м.п.» и «по размеру». Если клиент пропустит шаг, цены считаются для базового участка.</p>' +
      '<div class="calc-dim-grid">' +
      '<label>Название вкладки<input name="dimensionsName" value="' + esc(d.name) + '"></label>' +
      field('dimSkip', 'Кнопка «пропустить»', T.skip) + field('dimPresetsTitle', 'Заголовок типовых размеров', T.presetsTitle) +
      '<label class="wide">Подсказка под заголовком<input name="dimensionsSub" value="' + esc(d.sub) + '"></label>' +
      numField('dimensionsMin', 'Минимальный размер, м', d.min, '0.01', '0.01') +
      numField('dimensionsMax', 'Максимальный размер, м', d.max, '0.1', '0.1') +
      numField('dimensionsStep', 'Шаг ввода, м', d.step, '0.01', '0.01') +
      '<label class="chk wide"><input type="checkbox" name="dimensionsAllowSkip"' + (d.allowSkip ? ' checked' : '') + '> Разрешить пропуск шага</label>' +
      field('dimHint', 'Пояснение, когда шаг можно пропустить', T.hint, { wide: true }) +
      field('dimHintRequired', 'Пояснение, когда размеры обязательны', T.hintRequired, { wide: true }) +
      '</div><div class="dim-presets-ed"><span class="lbl">Типовые участки — кнопки быстрого выбора (до 12)</span><div class="chips" data-presets>' +
      (P.map(function (p) { return '<span class="chip" data-l="' + p[0] + '" data-w="' + p[1] + '">' + fmtM(p[0]) + ' × ' + fmtM(p[1]) + ' м<button type="button" data-act="p-del" title="Убрать" aria-label="Убрать">×</button></span>'; }).join('') || '<span class="hint">Нет — посетитель вводит размеры сам.</span>') +
      '</div><div class="preset-add"><input name="pL" type="number" step="0.01" min="0.1" max="100" placeholder="Длина, м"><span>×</span><input name="pW" type="number" step="0.01" min="0.1" max="100" placeholder="Ширина, м">' +
      '<button type="button" class="btn line sm" data-act="p-add">+ Добавить</button></div></div></div>';
  }
  function contactCard(U, num) {
    var C2 = U.contact;
    return '<div class="card blk blk-contact" data-key="@contact">' + blockHead(num, 'Контакты — заявка', { move: false, tag: 'всегда последний шаг' }) +
      '<div class="calc-dim-grid">' + field('ctName', 'Название вкладки', C2.name) + field('ctTitle', 'Заголовок', C2.title) + field('ctButton', 'Кнопка отправки', C2.button) +
      field('ctSub', 'Пояснение', C2.sub, { wide: true }) +
      field('ctTitleInd', 'Заголовок — индивидуальный проект', C2.titleInd) + field('ctButtonInd', 'Кнопка — индивидуальный проект', C2.buttonInd) + '<span></span>' +
      field('ctSubInd', 'Пояснение — индивидуальный проект', C2.subInd, { wide: true }) +
      '<label class="chk"><input type="checkbox" name="ctComment"' + (C2.comment ? ' checked' : '') + '> Поле «Комментарий»</label>' + field('ctCommentPh', 'Подсказка в поле комментария', C2.commentPh) + '<span></span>' +
      field('ctOk', 'Сообщение после отправки', C2.ok, { wide: true }) + field('ctConsent', 'Текст о согласии на обработку данных', C2.consent, { wide: true }) + '</div></div>';
  }
  function summaryCard(U) {
    var S2 = U.summary;
    return '<div class="card blk blk-sum" data-key="@summary"><div class="blk-head"><b>Панель «Ваш комплекс» — итог рядом с шагами</b></div>' +
      '<div class="calc-dim-grid">' + field('smTitle', 'Заголовок', S2.title) + field('smTotal', 'Подпись итога', S2.total) + field('smIndividual', 'Вместо цены, если расчёт индивидуальный', S2.individual) +
      field('smEmpty', 'Если ничего не выбрано', S2.empty) + field('smNote', 'Примечание под итогом', S2.note, { area: true, rows: 2, wide: true }) + '</div></div>';
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
    if (p.mode === 'piece') return { mode: 'piece', maxQty: p.maxQty };
    var tr = { enabled: false, tileA: 60, tileB: 50, material: 0, cut: 0 };
    if (p.mode === 'curve' && it.pricing && it.pricing.simple) {
      var sn = PP.normalizeCurve(it.pricing.curve);
      return { mode: 'simple', quantity: p.quantity, share: sn.share * 100, piece: sn.piece, rate: sn.rates.unit, min: sn.min, trim: sn.trim };
    }
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
      nf('cmk', 'Наценка, ×', m.markup, 'Цена = затраты с резервом × наценка', ' min="0.01"', 6) +
      nf('cmin', 'Минимальная сумма, BYN', m.min, '0 — без минимума') +
      '<div class="fit"><label class="nf"><span>Желаемая цена в базовой точке</span><input name="ctarget" type="number" step="any" min="0" placeholder="например, 2250"></label>' +
      '<label class="nf"><span>…или цена за 1 ' + u + '</span><input name="ctargetu" type="number" step="any" min="0" placeholder="например, 500"></label>' +
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

  /* ставка: цена = ставка × измерение (не ниже минимума) — без затрат и наценки; сама ставка — в поле цены */
  function simplePanel(m) {
    var area = m.quantity === 'area';
    return '<div class="curve-panel simple-panel"><div class="simple-grid">' +
      (area ? '<input type="hidden" name="cq" value="area">'
        : '<label class="nf"><span>Что измеряем</span><select name="cq">' + MEASURES.filter(function (x) { return x[0] !== 'area'; }).map(function (x) {
          return '<option value="' + x[0] + '"' + (m.quantity === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
        }).join('') + '</select><small>Цена = ставка × метры</small></label>') +
      nf('cmin', 'Минимальная сумма, BYN', m.min, '0 — без минимума') +
      nf('cshare', 'Доля от измерения, %', m.share, area ? 'Например, 50% — половина площади' : 'Например, 50% — только две стороны', ' max="100" min="1"') +
      nf('cpiece', 'Продаётся кратно, ' + (area ? 'м²' : 'м'), m.piece, '0 — не округлять') +
      '</div><div class="curve-out"></div></div>';
  }
  /* за штуку: на сайте «100 BYN/шт.», клиент выбирает количество, в итоге — цена × количество */
  function piecePanel(m) {
    return '<div class="curve-panel simple-panel piece-panel"><div class="simple-grid">' +
      nf('cmaxq', 'Максимум, шт.', m.maxQty, 'Клиент выбирает количество от 1 до этого числа', ' min="1" max="99"', 0) +
      '<p class="hint">На сайте у выбранной позиции появятся кнопки «− 1 +». В итог и в заявку идёт цена × количество.</p>' +
      '</div></div>';
  }
  var PMODES = [
    ['fixed', 'BYN', 'Цена за всё'], ['area', 'BYN/м²', 'Ставка за 1 м² площади участка'], ['line', 'BYN/м.п.', 'Ставка за 1 погонный метр'],
    ['piece', 'BYN/шт.', 'Цена за 1 шт. — клиент выбирает количество'], ['curve', 'По размеру', 'Кривая цен: затраты + наценка, зависит от размеров участка']
  ];
  function pmOf(m) { return m.mode === 'simple' ? (m.quantity === 'area' ? 'area' : 'line') : m.mode === 'curve' ? 'curve' : m.mode === 'piece' ? 'piece' : 'fixed'; }
  function itemHTML(it, ii) {
    var m = formModel(it), pm = pmOf(m), curve = pm === 'curve', simple = pm === 'area' || pm === 'line';
    var ph = { fixed: 'инд. расчёт', area: 'ставка', line: 'ставка', piece: 'инд. расчёт' }[pm];
    var tt = { fixed: 'Цена, BYN (пусто — индивидуальный расчёт)', area: 'Ставка, BYN за 1 м²', line: 'Ставка, BYN за 1 м.п.', piece: 'Цена за 1 шт., BYN (пусто — индивидуальный расчёт)' }[pm];
    var val = simple ? plain(m.rate) : (it.price == null ? '' : it.price);
    return '<div class="it calc-it' + (curve || simple ? ' is-curve' : '') + (simple ? ' is-simple' : '') + (pm === 'piece' ? ' is-piece' : '') + '" data-ii="' + ii + '" data-id="' + esc(it.id) + '" data-pm="' + pm + '">' +
      '<div class="it-main">' +
      '<input name="iname" value="' + esc(it.name) + '" placeholder="Название">' +
      '<div class="pr-box">' +
      (curve ? '<input name="iprice" class="calc-price-ro" readonly tabindex="-1" title="Цена в базовой точке — считается автоматически" value="">'
        : '<input name="iprice" type="number" min="0" step="0.01" value="' + esc(val) + '" placeholder="' + ph + '" title="' + tt + '">') +
      '<select name="pmode" class="pm-sel" aria-label="Единица цены" title="' + esc(PMODES.filter(function (x) { return x[0] === pm; })[0][2]) + '">' + PMODES.map(function (x) {
        return '<option value="' + x[0] + '"' + (x[0] === pm ? ' selected' : '') + ' title="' + esc(x[2]) + '">' + x[1] + '</option>';
      }).join('') + '</select></div>' +
      '<label class="ot-chk" title="Показывать «от» перед ценой на сайте"><input type="checkbox" name="ifrom"' + (it.from === true ? ' checked' : '') + '><span>от</span></label>' +
      '<input name="inote" value="' + esc(it.note || '') + '" placeholder="Подпись / примечание">' +
      '<div class="tools"><button class="ic" data-act="i-up" title="Выше">↑</button><button class="ic" data-act="i-down" title="Ниже">↓</button><button class="ic del" data-act="i-del" title="Удалить">✕</button></div>' +
      '</div>' + (simple ? simplePanel(m) : curve ? curvePanel(m) : pm === 'piece' ? piecePanel(m) : '') + '</div>';
  }

  function stepCard(s, num) {
    return '<div class="card step blk" data-key="' + esc(s.id) + '" data-id="' + esc(s.id) + '">' +
      '<div class="step-head"><span class="blk-n">' + num + '</span>' + field('name', 'Название вкладки', s.name) + field('sub', 'Подсказка под заголовком', s.sub) +
      '<label>Выбор<select name="type"><option value="radio"' + (s.type !== 'multi' ? ' selected' : '') + '>Один вариант</option><option value="multi"' + (s.type === 'multi' ? ' selected' : '') + '>Несколько</option></select></label>' +
      '<div class="tools"><button class="ic" data-act="b-up" title="Выше">↑</button><button class="ic" data-act="b-down" title="Ниже">↓</button><button class="ic del" data-act="s-del" title="Удалить шаг">✕</button></div></div>' +
      '<div class="colh calc-colh"><span>Позиция</span><span>Цена и единица</span><span title="Показывать «от» перед ценой">«от»</span><span>Подпись</span><span></span></div>' +
      '<div class="items">' + (s.items || []).map(itemHTML).join('') + '</div>' +
      '<button class="btn line sm" data-act="i-add" style="margin-top:12px">+ Позиция</button></div>';
  }
  function drawCalc() {
    var steps = ((content().calc && content().calc.steps) || []).filter(function (s) { return s.id !== 'monument'; }), byId = {};
    steps.forEach(function (s) { byId[s.id] = s; });
    var U = ui(), ids = steps.map(function (s) { return s.id; });
    var keys = CF ? CF.sequence(ids, { order: U.order }) : ['@monument', '@dimensions'].concat(ids), n = 0;
    drawCalcBase();
    var dimsOld = $('#calcDimensionsEd'); if (dimsOld) dimsOld.remove();
    $('#calcEd').innerHTML = '<p class="hint calc-flow-hint">Шаги идут в этом порядке. Стрелками ↑↓ меняйте порядок любых шагов, «Показывать» — скрывает шаг на сайте. «Контакты» всегда последние.</p>' +
      keys.map(function (k) {
        n++;
        if (k === '@monument') return monumentCard(U, n);
        if (k === '@dimensions') return dimensionsCard(U, n);
        return byId[k] ? stepCard(byId[k], n) : (n--, '');
      }).join('') + contactCard(U, n + 1) + summaryCard(U);
    refreshAllCurves();
  }

  /* ----- чтение позиции из формы ----- */
  var LINE_Q = { perimeter: 1, halfPerimeter: 1, length: 1, width: 1 };
  function noTrim() { return { enabled: false, tileA: 60, tileB: 50, material: 0, cut: 0 }; }
  function simplePricing(q, rate, c) {
    c = c || {};
    return { mode: 'curve', simple: true, quantity: q, curve: { share: c.share > 0 ? c.share : 1, piece: c.piece > 0 ? c.piece : 0, costFixed: 0, costUnit: rate,
      reserve: 0, markup: 1, min: c.min > 0 ? c.min : 0, trim: noTrim() } };
  }
  /* тип цены переключили — цена в базовой точке остаётся прежней */
  function convertItem(out, prev, pm, bd, base) {
    var pp = prev.pricing || {}, pc = pp.curve || {}, P0 = prev.price == null ? null : Math.max(0, +prev.price || 0);
    if (pm === 'fixed' || pm === 'piece') {
      out.price = P0;
      out.pricing = pm === 'piece' ? { mode: 'piece', maxQty: 10 } : { mode: 'fixed' };
      return out;
    }
    if (pm === 'area' || pm === 'line') {
      var q = pm === 'area' ? 'area' : (LINE_Q[pp.quantity] ? pp.quantity : 'perimeter');
      var c = pp.mode === 'curve' ? pc : {}, mv = PP.measureValue(q, bd) * (c.share > 0 ? c.share : 1);
      out.pricing = simplePricing(q, mv > 0 && P0 ? Math.round(P0 / mv * 100) / 100 : 0, c);
    } else if (pp.mode === 'curve') {     // со ставки на кривую: та же цена, дальше можно добавить затраты и наценку
      out.pricing = { mode: 'curve', quantity: pp.quantity || 'area', curve: { share: pc.share > 0 ? pc.share : 1, piece: pc.piece || 0, costFixed: 0,
        costUnit: pc.costUnit || 0, reserve: 0, markup: 1, min: pc.min || 0, trim: noTrim() } };
    } else {
      out.pricing = { mode: 'curve', quantity: 'area', curve: { share: 1, piece: 0, costFixed: 0, costUnit: (P0 || 0) / bd.area, reserve: 0, markup: 1, min: 0, trim: noTrim() } };
    }
    var a = PP.analyzeAt(out, bd, { base: base });
    out.price = a ? PP.roundMoney(a.price) : 0;
    return out;
  }
  function readItem(row, base, force) {
    base = base || readBase();
    var g = function (n) { var e = $('[name=' + n + ']', row); return e ? e.value : ''; };
    var n = function (x, d) { var v = parseFloat(String(g(x)).replace(',', '.')); return isFinite(v) ? v : d; };
    var R = row.dataset.pm || 'fixed', pm = force || g('pmode') || R, fb = $('[name=ifrom]', row);
    if (pm === 'simple') pm = (g('cq') || 'area') === 'area' ? 'area' : 'line';
    var out = { id: row.dataset.id, name: g('iname').trim() || 'Позиция', note: g('inote').trim() || undefined, from: fb && fb.checked ? true : undefined };
    var bd = PP.dimsOf(base.length, base.width);
    if (pm !== R) return keepExtra(convertItem(out, readItem(row, base, R), pm, bd, base), row);
    if (pm === 'fixed' || pm === 'piece') {
      var p = g('iprice').trim();
      out.price = p === '' ? null : Math.max(0, Math.round(+p * 100) / 100);
      out.pricing = pm === 'piece' ? { mode: 'piece', maxQty: Math.round(Math.min(99, Math.max(1, n('cmaxq', 10)))) } : { mode: 'fixed' };
      return keepExtra(out, row);
    }
    if (pm === 'area' || pm === 'line') {   // ставка: цена = ставка × измерение (не ниже минимума)
      var q = pm === 'area' ? 'area' : (LINE_Q[g('cq')] ? g('cq') : 'perimeter');
      out.pricing = simplePricing(q, Math.max(0, Math.round(n('iprice', 0) * 100) / 100),
        { share: Math.min(100, Math.max(1, n('cshare', 100))) / 100, piece: Math.max(0, n('cpiece', 0)), min: Math.max(0, n('cmin', 0)) });
      var sa = PP.analyzeAt(out, bd, { base: base });
      out.price = sa ? PP.roundMoney(sa.price) : 0;
      return keepExtra(out, row);
    }
    var trimBox = $('[name=ctrim]', row);
    out.pricing = { mode: 'curve', quantity: g('cq') || 'area', curve: {
      share: Math.min(100, Math.max(1, n('cshare', 100))) / 100, piece: Math.max(0, n('cpiece', 0)),
      costFixed: Math.max(0, n('cfix', 0)), costUnit: Math.max(0, n('cunit', 0)), reserve: Math.max(0, n('cres', 0)),
      markup: n('cmk', 1) > 0 ? n('cmk', 1) : 1, min: Math.max(0, n('cmin', 0)),
      trim: { enabled: !!(trimBox && trimBox.checked && !trimBox.disabled), tileA: Math.max(1, n('ctA', 60)), tileB: Math.max(1, n('ctB', 50)),
        material: Math.max(0, n('cmat', 0)), cut: Math.max(0, n('ccut', 0)) } } };
    var a = PP.analyzeAt(out, bd, { base: base });
    out.price = a ? PP.roundMoney(a.price) : 0;
    return keepExtra(out, row);
  }
  /* поля позиции, которых нет в форме (таблица сметы и т.п.), сохраняем как были */
  function origItem(row) {
    var st = row.closest('.step'), sid = st && st.dataset.id, steps = (content().calc && content().calc.steps) || [];
    var s = steps.filter(function (x) { return x.id === sid; })[0];
    return s ? (s.items || []).filter(function (x) { return x.id === row.dataset.id; })[0] : null;
  }
  function keepExtra(out, row) {
    var o = origItem(row);
    if (o) Object.keys(o).forEach(function (k) { if (!(k in out)) out[k] = o[k]; });
    return out;
  }
  /* простая ставка: цены для типовых размеров (форма как у базового участка) */
  function simpleTable(it, base) {
    var p = PP.normalizePricing(it), u = unitOf(p.quantity);
    var rows = [0.6, 0.8, 1, 1.3, 1.7, 2.2].map(function (s) {
      var d = PP.dimsOf(base.length * s, base.width * s), a = PP.analyzeAt(it, d, { base: base });
      return '<tr' + (s === 1 ? ' class="base"' : '') + '><td>' + f2(d.length) + ' × ' + f2(d.width) + (s === 1 ? ' <i>база</i>' : '') + '</td><td>' + f2(PP.measureValue(p.quantity, d)) + ' ' + u + '</td><td><b>' + f2(a.price) + '</b></td></tr>';
    }).join('');
    return '<table class="size-table"><thead><tr><th>Участок, м</th><th>Количество</th><th>Цена, BYN</th></tr></thead><tbody>' + rows + '</tbody></table>';
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

  /* таблица из сметы владельца: цена клиента по текущей настройке, мастер, материалы, прибыль */
  function estimateTable(it, base) {
    var e = it.estimate;
    if (!e || !Array.isArray(e.rows) || !e.rows.length) return '';
    var rows = e.rows.map(function (r) {
      var d = PP.dimsOf(+r[0], +r[1]), a = PP.analyzeAt(it, d, { base: base });
      var master = (+e.master || 0) * d.area, mat = +r[2] || 0, profit = a.price - master - mat;
      return '<tr><td>' + f2(d.length) + ' × ' + f2(d.width) + '</td><td>' + f2(d.area) + '</td><td><b>' + f2(a.price) + '</b></td><td>' + f2(a.price / d.area) +
        '</td><td>' + f2(master) + '</td><td>' + f2(mat) + '</td><td><b' + (profit < 0 ? ' class="neg"' : '') + '>' + f2(profit) + '</b></td><td>' + (a.price > 0 ? Math.round(profit / a.price * 100) : 0) + '%</td></tr>';
    }).join('');
    return '<h4>Смета по типовым размерам — мастер ' + f2(e.master) + ' BYN/м², материалы из вашей таблицы</h4><div class="tbl"><table class="size-table est-table">' +
      '<thead><tr><th>Участок, м</th><th>м²</th><th>Цена клиента</th><th>BYN/м²</th><th>Мастер</th><th>Материалы</th><th>Прибыль</th><th>Маржа</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
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
    if (row.classList.contains('is-simple')) {
      out.innerHTML = '<h4>Цены для разных размеров</h4><div class="tbl">' + simpleTable(it, base) + '</div>';
      return;
    }
    var ch = chartHTML(it, base, bd);
    out.innerHTML =
      '<div class="curve-cols"><div class="curve-left"><h4>Расчёт для базового участка</h4>' + breakdownHTML(it, base, bd) + '</div>' +
      '<div class="curve-right"><div class="chart-bar"><h4>Кривая цен</h4><span class="seg" role="group">' +
      '<button type="button" data-metric="total" class="' + (chartMetric === 'total' ? 'on' : '') + '">Итоговая цена</button>' +
      '<button type="button" data-metric="perm2" class="' + (chartMetric === 'perm2' ? 'on' : '') + '">Цена за 1 м²</button></span>' +
      '<span class="seg" role="group">' + [2, 4, 9].map(function (r) { return '<button type="button" data-range="' + r + '" class="' + (chartRange === r ? 'on' : '') + '" title="Правый край графика: площадь в ' + r + ' раза больше базовой">до ×' + r + ' пл.</button>'; }).join('') + '</span></div>' +
      '<div class="chart-box">' + ch.html + '</div>' +
      '<div class="chart-legend"><span class="lg price">цена для клиента</span>' + (ch.hasCost ? '<span class="lg cost">затраты с резервом</span>' : '') + '<span class="lg base">базовая точка</span><span class="readout" data-readout>Наведите курсор на график — покажу цену для любого размера.</span></div></div></div>' +
      (it.estimate ? estimateTable(it, base) : '<h4>Цены для разных размеров (форма как у базового участка)</h4><div class="tbl">' + sizeTable(it, base) + '</div>');
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
    var cur = content().calc || {}, oldSteps = cur.steps || [], ed = $('#calcEd');
    var blk = function (k) { return $('[data-key="' + k + '"]', ed); };
    var val = function (box, n, d) { var e = box && $('[name=' + n + ']', box); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : d; };
    var U = ui(), d = blk('@dimensions'), m = blk('@monument'), c = blk('@contact'), sm = blk('@summary'), dc = calcDimensionsConfig();
    var dims = {
      enabled: val(d, 'dimensionsEnabled', dc.enabled), name: val(d, 'dimensionsName', dc.name) || 'Размеры', sub: val(d, 'dimensionsSub', dc.sub), unit: 'м',
      min: Math.max(0.01, +val(d, 'dimensionsMin', dc.min) || 0.1), max: Math.max(0.01, +val(d, 'dimensionsMax', dc.max) || 100),
      step: Math.max(0.01, +val(d, 'dimensionsStep', dc.step) || 0.1), allowSkip: val(d, 'dimensionsAllowSkip', dc.allowSkip),
      hint: val(d, 'dimHint', U.dimensions.hint), hintRequired: val(d, 'dimHintRequired', U.dimensions.hintRequired),
      skip: val(d, 'dimSkip', U.dimensions.skip), presetsTitle: val(d, 'dimPresetsTitle', U.dimensions.presetsTitle)
    };
    if (dims.max < dims.min) dims.max = dims.min;
    if (d) dims.presets = $$('[data-presets] .chip', d).map(function (x) { return [+x.dataset.l, +x.dataset.w]; });
    var base = readBase();
    /* ключи, которых нет в форме (метка тарифов, настройки шагов), не теряем */
    var out = Object.assign({}, cur, { dimensions: Object.assign({}, cur.dimensions || {}, dims), base: base });
    out.monument = { enabled: val(m, 'monEnabled', U.monument.enabled), name: val(m, 'monName', U.monument.name), sub: val(m, 'monSub', U.monument.sub),
      pick: val(m, 'monPick', U.monument.pick), pickOther: val(m, 'monPickOther', U.monument.pickOther), ind: val(m, 'monInd', U.monument.ind), indButton: val(m, 'monIndButton', U.monument.indButton) };
    out.contact = { name: val(c, 'ctName', U.contact.name), title: val(c, 'ctTitle', U.contact.title), sub: val(c, 'ctSub', U.contact.sub), button: val(c, 'ctButton', U.contact.button),
      titleInd: val(c, 'ctTitleInd', U.contact.titleInd), subInd: val(c, 'ctSubInd', U.contact.subInd), buttonInd: val(c, 'ctButtonInd', U.contact.buttonInd),
      comment: val(c, 'ctComment', U.contact.comment), commentPh: val(c, 'ctCommentPh', U.contact.commentPh), ok: val(c, 'ctOk', U.contact.ok), consent: val(c, 'ctConsent', U.contact.consent) };
    out.summary = { title: val(sm, 'smTitle', U.summary.title), total: val(sm, 'smTotal', U.summary.total), individual: val(sm, 'smIndividual', U.summary.individual),
      empty: val(sm, 'smEmpty', U.summary.empty), note: val(sm, 'smNote', U.summary.note) };
    var keys = $$('#calcEd > .blk[data-key]').map(function (x) { return x.dataset.key; }).filter(function (k) { return k !== '@contact' && k !== '@summary'; });
    if (keys.length) out.order = keys;
    out.steps = $$('#calcEd .step').map(function (st) {
      var old = oldSteps.filter(function (x) { return x.id === st.dataset.id; })[0] || {};
      return Object.assign({}, old, { id: st.dataset.id, name: $('[name=name]', st).value.trim() || 'Шаг', sub: $('[name=sub]', st).value.trim(), type: $('[name=type]', st).value,
        items: $$('.it', st).map(function (it) { return readItem(it, base); }).filter(function (x) { return x.name; }) });
    });
    var mon = oldSteps.filter(function (x) { return x.id === 'monument'; });
    if (mon.length) out.steps = mon.concat(out.steps);
    return out;
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
      var row = b.closest('.calc-it'), target = parseFloat($('[name=ctarget]', row).value), perUnit = parseFloat(($('[name=ctargetu]', row) || {}).value);
      var base = readBase(), it = readItem(row, base), p = PP.normalizePricing(it), cs = p.curve.costs;
      var bd = PP.dimsOf(base.length, base.width), ev = PP.analyzeAt(it, bd, { base: base }).eval;
      if (perUnit > 0) target = perUnit * PP.measureValue(p.quantity, bd) * p.curve.share;   // «500 BYN за м²» → цена базового участка
      if (!(target > 0)) { toast('Введите желаемую цену в базовой точке или цену за единицу', true); return; }
      if (!cs || !(ev.cost.total > 0)) { toast('Сначала укажите затраты — иначе наценку не подобрать', true); return; }
      $('[name=cmk]', row).value = plain(target / ev.cost.total);
      renderCurveOut(row); toast('Наценка подобрана: ×' + f2(target / ev.cost.total));
      return;
    }
    if (a === 'p-del') { var chip = b.closest('.chip'); if (chip) chip.remove(); return; }
    if (a === 'p-add') {
      var box = b.closest('.dim-presets-ed'), L = parseFloat(String($('[name=pL]', box).value).replace(',', '.')), Wd = parseFloat(String($('[name=pW]', box).value).replace(',', '.'));
      if (!(L > 0 && Wd > 0 && L <= 100 && Wd <= 100)) { toast('Введите длину и ширину участка, м', true); return; }
      if ($$('[data-presets] .chip', box).length >= 12) { toast('Не больше 12 типовых размеров', true); return; }
      var cal0 = readCalc(); cal0.dimensions.presets = (cal0.dimensions.presets || []).concat([[Math.round(L * 100) / 100, Math.round(Wd * 100) / 100]]);
      setCalc(cal0); drawCalc(); return;
    }
    var cal = readCalc(), blkEl = b.closest('.blk'), key = blkEl && blkEl.dataset.key, it = b.closest('.it'), ii = it ? +it.dataset.ii : -1;
    var st = cal.steps.filter(function (x) { return x.id === key; })[0];
    function mv(list, i, d) { var j = i + d; if (i < 0 || j < 0 || j >= list.length) return; var t = list[i]; list[i] = list[j]; list[j] = t; }
    if ((a === 'b-up' || a === 'b-down') && cal.order) mv(cal.order, cal.order.indexOf(key), a === 'b-up' ? -1 : 1);
    if (a === 's-del' && st && confirm('Удалить шаг «' + st.name + '»?')) {
      cal.steps = cal.steps.filter(function (x) { return x !== st; }); if (cal.order) cal.order = cal.order.filter(function (k) { return k !== key; });
    }
    if (st && a === 'i-up') mv(st.items, ii, -1); if (st && a === 'i-down') mv(st.items, ii, 1);
    if (st && a === 'i-del') st.items.splice(ii, 1);
    if (st && a === 'i-add') st.items.push({ id: slug('item'), name: 'Новая позиция', price: 0, pricing: { mode: 'fixed' } });
    if (cal.order) {                        // шаги в массиве — в том же порядке, что и на сайте
      var pos = {}; cal.order.forEach(function (k, i) { pos[k] = i; });
      cal.steps.sort(function (x, y) { return (x.id === 'monument' ? -1 : pos[x.id] == null ? 999 : pos[x.id]) - (y.id === 'monument' ? -1 : pos[y.id] == null ? 999 : pos[y.id]); });
    }
    setCalc(cal); drawCalc();
  });
  $('#calcEd').addEventListener('input', function (e) {
    var row = e.target.closest && e.target.closest('.calc-it');
    if (row && row.classList.contains('is-curve') && e.target.name !== 'ctarget') renderCurveOut(row);
  });
  $('#calcEd').addEventListener('change', function (e) {
    var n = e.target && e.target.name;
    if (n === 'pmode' || n === 'cq' || n === 'ctrim') { var cal = readCalc(); setCalc(cal); drawCalc(); }
    if (n === 'monEnabled' || n === 'dimensionsEnabled') { var bl = e.target.closest('.blk'); if (bl) bl.classList.toggle('off', !e.target.checked); }
  });
  $('#calcBaseEd').addEventListener('input', function () { updateBaseFacts(); refreshAllCurves(); });
  $('#addStep').addEventListener('click', function () {
    var cal = readCalc(); cal.steps.push({ id: slug('step'), name: 'Новый шаг', type: 'radio', sub: '', items: [{ id: slug('item'), name: 'Вариант', price: 0 }] });
    setCalc(cal); drawCalc();
  });

  window.AdminCalc = { draw: drawCalc, read: readCalc };
})();
