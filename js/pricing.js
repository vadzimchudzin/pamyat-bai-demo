/* ПАМЯТЬ.БАЙ — единая формула цены калькулятора.
   Один и тот же файл работает в браузере (сайт, админка) и на сервере (сметы, api/_lib.js).

   ЦЕНА позиции типа «кривая» (mode = 'curve'):

     себестоимость = постоянные затраты
                   + затраты на 1 единицу × размер участка
                   + подрезка (отход плитки × цена плитки + метры реза × цена реза)
     цена          = себестоимость × (1 + резерв %) × наценка   (но не меньше «минимальной суммы»)

   Из-за постоянной части цена за м² растёт на малых участках и падает на больших,
   а итоговая цена всегда растёт вместе с размером. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PamyatPricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_BASE = { length: 2, width: 1.8, round: 1 };
  var EPS = 1e-9;

  function num(v, def, min, max) {
    if (v === '' || v == null) return def;
    v = Number(v);
    if (!isFinite(v)) return def;
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }
  function roundTo(n, step) {
    step = step > 0 ? step : 0.01;
    return Math.round(n / step + EPS) * step;
  }
  function roundMoney(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  function fmt(n) {
    var v = Math.round(Number(n) * 100) / 100;
    var s = String(v).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return s.join(',');
  }

  /* ---------- размеры ---------- */
  function normalizeBase(raw) {
    raw = raw || {};
    var step = num(raw.round, DEFAULT_BASE.round, 0.01, 1000);
    return {
      length: num(raw.length, DEFAULT_BASE.length, 0.01, 1000),
      width: num(raw.width, DEFAULT_BASE.width, 0.01, 1000),
      round: step
    };
  }
  function dimsOf(length, width) {
    length = Number(length); width = Number(width);
    return { provided: true, length: length, width: width, area: length * width, perimeter: 2 * (length + width) };
  }
  function measureValue(basis, d) {
    if (!d || !d.provided) return 0;
    if (basis === 'perimeter') return d.perimeter;
    if (basis === 'halfPerimeter') return d.perimeter / 2;
    if (basis === 'length') return d.length;
    if (basis === 'width') return d.width;
    return d.area;
  }
  function measureUnit(basis) { return basis === 'area' ? 'м²' : 'м.п.'; }
  var MEASURE_LABELS = {
    area: 'Площадь участка, м²',
    perimeter: 'Периметр участка, м.п.',
    halfPerimeter: 'Половина периметра, м.п.',
    length: 'Длина участка, м.п.',
    width: 'Ширина участка, м.п.'
  };

  /* ---------- подрезка плитки ---------- */
  /* Плитка a×b (м) на участке L×W: берём ту ориентацию, где закупается меньше плитки.
     Рез нужен поперёк ряда, если размер не кратен плитке. */
  function layout(L, W, a, b) {
    var nA = Math.ceil(L / a - EPS), nB = Math.ceil(W / b - EPS);
    var partA = nA * a - L > 1e-6, partB = nB * b - W > 1e-6;
    var tiles = nA * nB;
    return {
      tiles: tiles, purchaseArea: tiles * a * b,
      cutLen: (partA ? W : 0) + (partB ? L : 0),
      cols: nA, rows: nB
    };
  }
  function trimInfo(d, tileAcm, tileBcm) {
    var a = tileAcm / 100, b = tileBcm / 100;
    if (!d || !d.provided || !(a > 0) || !(b > 0)) return null;
    var x = layout(d.length, d.width, a, b), y = layout(d.length, d.width, b, a), best = x;
    if (y.purchaseArea < x.purchaseArea - 1e-9 || (Math.abs(y.purchaseArea - x.purchaseArea) <= 1e-9 && y.cutLen < x.cutLen)) best = y;
    var area = d.length * d.width;
    return {
      tiles: best.tiles,
      purchaseArea: round6(best.purchaseArea),
      wasteArea: round6(Math.max(0, best.purchaseArea - area)),
      wastePct: area > 0 ? Math.max(0, best.purchaseArea / area - 1) * 100 : 0,
      cutLen: round6(best.cutLen)
    };
  }

  /* ---------- настройки позиции ---------- */
  /* «за м²» / «за м.п.» в названии старых позиций. Единицы ищем только отдельным словом:
     иначе «мп» внутри слов («Комплекс», «лампада») превращало цену в «BYN/м.п.» */
  var RE_AREA = /(?:^|[^а-яёa-z])(?:м²|м2(?![0-9])|кв\.?\s*м(?![а-яё]))/i;
  var RE_LINEAR = /(?:^|[^а-яёa-z])(?:м\.?\s?п(?:\.|(?![а-яё]))|пог(?:\.|онн(?:ый|ых|ого)?)\s*(?:м|метр))/i;
  function legacyInferMode(name) {
    name = String(name || '');
    return RE_AREA.test(name) ? 'area' : RE_LINEAR.test(name) ? 'linear' : 'fixed';
  }
  function normalizeCurve(raw) {
    var c = raw || {}, hasCosts = c.costFixed != null || c.costUnit != null || c.markup != null || c.reserve != null;
    var trim = c.trim || {};
    var out = {
      share: num(c.share, 1, 0.01, 1),
      piece: num(c.piece, 0, 0, 1000),
      min: num(c.min, c.rates && c.rates.min != null ? c.rates.min : 0, 0),
      trim: {
        enabled: trim.enabled === true,
        tileA: num(trim.tileA, 60, 1, 1000),
        tileB: num(trim.tileB, 50, 1, 1000),
        material: num(trim.material, 0, 0),
        cut: num(trim.cut, 0, 0)
      },
      costs: null,
      rates: null
    };
    if (hasCosts || !c.rates) {
      var r = num(c.reserve, 0, 0, 500) / 100, k = num(c.markup, 1, 0.01, 1000);
      var costs = {
        fixed: num(c.costFixed, 0, 0), unit: num(c.costUnit, 0, 0),
        material: out.trim.material, cut: out.trim.cut, reserve: r, markup: k
      };
      var mult = (1 + r) * k;
      out.costs = costs;
      out.rates = { fixed: costs.fixed * mult, unit: costs.unit * mult, waste: costs.material * mult, cut: costs.cut * mult, min: out.min };
    } else {
      out.rates = {
        fixed: num(c.rates.fixed, 0, 0), unit: num(c.rates.unit, 0, 0),
        waste: num(c.rates.waste, 0, 0), cut: num(c.rates.cut, 0, 0), min: out.min
      };
    }
    return out;
  }
  /* Единый вид настроек позиции: fixed | curve | (старые) area / linear */
  function normalizePricing(it) {
    var raw = (it && it.pricing) || {}, name = String((it && it.name) || '');
    var mode = raw.mode || legacyInferMode(name);
    if (mode !== 'curve' && mode !== 'area' && mode !== 'linear') mode = 'fixed';
    var quantity = raw.quantity || (mode === 'area' ? 'area' : mode === 'linear' ? 'perimeter' : mode === 'curve' ? 'area' : 'unit');
    var k = raw.coefficient || {};
    return {
      mode: mode,
      quantity: quantity,
      curve: mode === 'curve' ? normalizeCurve(raw.curve) : null,
      coefficient: {   /* старая схема «коэффициент смещения» — оставлена для уже сохранённых позиций */
        enabled: k.enabled === true,
        formula: k.formula === 'linear' ? 'linear' : 'inverse',
        basis: k.basis || 'area',
        applyWhen: k.applyWhen || 'below',
        reference: num(k.reference, 4, 0.01),
        start: num(k.start, 1, 0),
        rate: num(k.rate, 0.15, 0),
        power: num(k.power, 1, 0.01),
        min: num(k.min, 1, 0),
        max: num(k.max, 2, 0.01)
      }
    };
  }

  /* ---------- расчёт «кривой» ---------- */
  function evalCurve(cfg, quantityBasis, d) {
    var cur = cfg, rates = cur.rates;
    var M = measureValue(quantityBasis, d) * cur.share, Q = M;
    if (cur.piece > 0) Q = Math.ceil(Q / cur.piece - EPS) * cur.piece;
    var t = (cur.trim.enabled && quantityBasis === 'area') ? trimInfo(d, cur.trim.tileA, cur.trim.tileB) : null;
    var waste = t ? t.wasteArea : 0, cut = t ? t.cutLen : 0;
    var parts = {
      fixed: rates.fixed, variable: rates.unit * Q, waste: waste * rates.waste, cut: cut * rates.cut
    };
    var trimPrice = parts.waste + parts.cut;
    var raw = parts.fixed + parts.variable + trimPrice;
    var total = Math.max(rates.min, raw);
    var res = { measure: M, quantity: Q, trim: t, parts: parts, trimPrice: trimPrice, total: total, minApplied: raw < rates.min };
    if (cur.costs) {
      var c = cur.costs;
      var cVar = c.unit * Q, cTrim = waste * c.material + cut * c.cut;
      var raw0 = c.fixed + cVar + cTrim, reserve = raw0 * c.reserve;
      res.cost = {
        fixed: c.fixed, variable: cVar, variableRate: c.unit, waste: waste * c.material, cut: cut * c.cut,
        subtotal: raw0, reserve: reserve, total: raw0 + reserve, markup: c.markup
      };
    }
    return res;
  }

  /* Главная функция: цена одной позиции для участка d.
     opts.base — «базовый участок» (для позиций-кривых без введённых размеров);
     opts.basePrice — цена позиции в базовой точке, если её нужно подменить (прайс-лист);
     opts.ignoreStoredPrice — игнорировать it.price (предпросмотр в админке). */
  function calcItem(it, d, opts) {
    opts = opts || {};
    var p = normalizePricing(it);
    var storedPrice = it && it.price != null ? Math.max(0, Number(it.price) || 0) : null;
    var override = opts.basePrice != null ? Number(opts.basePrice) : (opts.ignoreStoredPrice ? null : storedPrice);

    if (p.mode === 'curve') {
      var base = normalizeBase(opts.base), bd = dimsOf(base.length, base.width);
      var provided = !!(d && d.provided), use = provided ? d : bd;
      var ev = evalCurve(p.curve, p.quantity, use), f = 1;
      if (override != null && isFinite(override)) {
        var evb = evalCurve(p.curve, p.quantity, bd);
        /* сравниваем с уже округлённой ценой, иначе при шаге 5 или 10 BYN цена считалась бы «подменённой» */
        if (evb.total > 0 && Math.abs(roundTo(evb.total, base.round) - override) > Math.max(0.5, base.round / 2)) f = override / evb.total;
      }
      var step = base.round;
      var amount = roundTo(ev.total * f, step);
      var trimAmount = Math.min(amount, roundTo(ev.trimPrice * f, step));
      var out = {
        mode: 'curve', provided: provided, amount: roundMoney(amount), mainAmount: roundMoney(amount - trimAmount),
        trimAmount: roundMoney(trimAmount), quantity: roundMoney(ev.quantity), unit: measureUnit(p.quantity),
        coefficient: 1, base: null, scale: f, eval: ev, measure: p.quantity
      };
      out.note = curveNote(out, p);
      return out;
    }

    var basePrice = override != null ? override : storedPrice;
    if (basePrice == null) return { amount: null, quantity: 0, unit: '', coefficient: 1, base: null, mode: p.mode };
    basePrice = Math.max(0, basePrice);
    if (p.mode === 'fixed' || !d || !d.provided) {
      return { amount: roundMoney(basePrice), quantity: 1, unit: p.mode === 'area' ? 'м²' : p.mode === 'linear' ? 'м.п.' : 'шт.', coefficient: 1, base: basePrice, mode: p.mode };
    }
    var quantity = p.mode === 'area' ? d.area : measureValue(p.quantity, d);
    if (!quantity || !isFinite(quantity)) quantity = 1;
    var coefficient = legacyCoefficient(p, d);
    var unit = p.mode === 'area' || p.quantity === 'area' ? 'м²' : 'м.п.';
    return {
      amount: roundMoney(basePrice * quantity * coefficient), quantity: roundMoney(quantity), unit: unit,
      coefficient: roundMoney(coefficient), base: basePrice, mode: p.mode
    };
  }
  function legacyCoefficient(p, d) {
    var k = p.coefficient;
    if (!k || !k.enabled || !d || !d.provided) return 1;
    var value = measureValue(k.basis, d), reference = Math.max(0.01, k.reference), diff = value - reference;
    var active = k.applyWhen === 'both' || (k.applyWhen === 'below' && diff < 0) || (k.applyWhen === 'above' && diff > 0);
    if (!active) return 1;
    var factor = k.formula === 'inverse'
      ? (k.start || 1) * Math.pow(reference / Math.max(0.01, value), Math.max(0.01, k.power))
      : (k.start || 1) + Math.abs(diff) * Math.max(0, k.rate);
    var min = Math.max(0, k.min), max = Math.max(min, k.max || 2);
    return Math.min(max, Math.max(min, factor));
  }

  /* Текст для клиента: без затрат, резерва и наценки. */
  function curveNote(out, p) {
    var ev = out.eval, parts = [];
    if (ev.trim) {
      if (ev.trim.cutLen > 0 || ev.trim.wasteArea > 0) {
        parts.push('плитка ' + ev.trim.tiles + ' шт., подрезка: отход ' + fmt(ev.trim.wasteArea) + ' м², рез ' + fmt(ev.trim.cutLen) + ' м.п.');
      } else {
        parts.push('плитка ' + ev.trim.tiles + ' шт., ложится без подрезки');
      }
    }
    if (p.curve.piece > 0) parts.push('количество округлено до целых элементов по ' + fmt(p.curve.piece) + ' м');
    if (!out.provided) parts.push('размеры не указаны — расчёт для базового участка');
    return parts.join('; ');
  }

  /* Ставка за единицу, если цена строго пропорциональна размеру (нет постоянной части,
     минимума, подрезки и округления до элементов) — тогда клиенту можно показать «500 BYN/м²». */
  function linearRate(it) {
    var p = normalizePricing(it);
    if (p.mode !== 'curve') return null;
    var c = p.curve, r = c.rates;
    if (r.fixed > 0.005 || r.min > 0.005 || c.piece > 0 || (c.trim.enabled && p.quantity === 'area') || !(r.unit > 0)) return null;
    return { rate: roundMoney(r.unit * c.share), unit: measureUnit(p.quantity), quantity: p.quantity };
  }

  /* ---------- анализ для админки ---------- */
  function analyzeAt(it, d, opts) {
    var p = normalizePricing(it);
    if (p.mode !== 'curve') return null;
    var o = Object.assign({}, opts || {}, { ignoreStoredPrice: true, basePrice: null });
    var base = normalizeBase(o.base), step = base.round;
    var ev = evalCurve(p.curve, p.quantity, d);
    var price = roundTo(ev.total, step), cost = ev.cost ? ev.cost.total : null;
    var area = d.area;
    return {
      dims: d, eval: ev, price: price, area: area, perM2: area > 0 ? price / area : null,
      cost: cost, margin: cost != null && price > 0 ? (price - cost) / price : null,
      profit: cost != null ? price - cost : null
    };
  }
  function curvePoints(it, opts, from, to, count) {
    var base = normalizeBase(opts && opts.base);
    from = from || 0.3; to = to || 3; count = count || 120;
    var pts = [];
    for (var i = 0; i <= count; i++) {
      var s = from + (to - from) * i / count;
      var a = analyzeAt(it, dimsOf(base.length * s, base.width * s), opts);
      if (a) pts.push({ s: s, area: a.area, price: a.price, perM2: a.perM2, cost: a.cost, margin: a.margin });
    }
    return pts;
  }

  /* ---------- что можно отдавать публично ---------- */
  /* Затраты, резерв и наценка не должны попадать на сайт: клиенту уходят только готовые ставки. */
  function sanitizeCalcForPublic(calc) {
    if (!calc || typeof calc !== 'object') return calc;
    var c = JSON.parse(JSON.stringify(calc));
    (c.steps || []).forEach(function (st) {
      (st.items || []).forEach(function (it) {
        delete it.estimate;                 /* таблица сметы (мастер, материалы) — только для админки */
        if (!it.pricing || it.pricing.mode !== 'curve') return;
        var n = normalizeCurve(it.pricing.curve);
        it.pricing = {
          mode: 'curve', quantity: it.pricing.quantity || 'area',
          curve: {
            share: n.share, piece: n.piece, min: n.min,
            trim: { enabled: n.trim.enabled, tileA: n.trim.tileA, tileB: n.trim.tileB },
            rates: n.rates
          }
        };
      });
    });
    return c;
  }

  return {
    DEFAULT_BASE: DEFAULT_BASE, MEASURE_LABELS: MEASURE_LABELS,
    num: num, fmt: fmt, roundMoney: roundMoney, roundTo: roundTo,
    normalizeBase: normalizeBase, dimsOf: dimsOf, measureValue: measureValue, measureUnit: measureUnit,
    trimInfo: trimInfo, normalizeCurve: normalizeCurve, normalizePricing: normalizePricing,
    calcItem: calcItem, analyzeAt: analyzeAt, curvePoints: curvePoints, linearRate: linearRate, inferMode: legacyInferMode,
    legacyCoefficient: function (it, d) { return legacyCoefficient(normalizePricing(it), d); },
    sanitizeCalcForPublic: sanitizeCalcForPublic
  };
});
