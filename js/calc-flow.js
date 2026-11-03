/* ПАМЯТЬ.БАЙ — калькулятор: порядок шагов и тексты интерфейса (админка → «Калькулятор»).
   Общий модуль для сайта, админки и тестов. Шаги-«блоки»: @monument (памятник из каталога),
   @dimensions (размеры участка) и обычные шаги по их id; шаг «Контакты» всегда последний. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PamyatCalcFlow = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MONUMENT = '@monument', DIMENSIONS = '@dimensions';
  var DEF = {
    monument: {
      enabled: true, name: 'Памятник', sub: 'Выберите форму — как в каталоге. Гранит и размеры согласуем лично.',
      pick: 'Выбрать модель в каталоге', pickOther: 'выбрать другую',
      ind: 'Индивидуальный проект считаем лично: по эскизу или фото подберём гранит и размеры. Нажмите «Заказать звонок» — перезвоним и всё обсудим.',
      indButton: 'Заказать звонок'
    },
    dimensions: {
      hint: 'Размеры не обязательны. Если пропустить этот шаг, калькулятор покажет базовые цены без пересчёта по площади и периметру.',
      hintRequired: 'Укажите оба размера, чтобы рассчитать стоимость по площади и периметру.',
      skip: 'Не указывать размеры — пропустить', presetsTitle: 'Типовые участки'
    },
    contact: {
      name: 'Контакты', title: 'Куда прислать расчёт?', sub: 'Оставьте имя и телефон — перезвоним, уточним детали и зафиксируем смету.',
      button: 'Отправить заявку', titleInd: 'Обсудим ваш проект',
      subInd: 'Индивидуальный проект считаем лично. Оставьте имя и телефон — перезвоним, обсудим эскиз, гранит и размеры.',
      buttonInd: 'Заказать звонок', comment: true, commentPh: 'Комментарий (необязательно)',
      ok: 'Спасибо! Перезвоним в рабочее время и уточним детали.',
      consent: 'Нажимая кнопку, вы соглашаетесь с политикой обработки персональных данных.'
    },
    summary: {
      title: 'Ваш комплекс', total: 'Итого', individual: 'Индивидуально', empty: 'не выбрано',
      note: 'Ориентир по базовым ценам. Точную смету рассчитаем после выезда, цена фиксируется в договоре.'
    }
  };
  function txt(v, d, max) { v = v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); return v ? v.slice(0, max || 600) : d; }
  function group(raw, def) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var out = {};
    Object.keys(def).forEach(function (k) {
      out[k] = typeof def[k] === 'boolean' ? (raw[k] === undefined ? def[k] : raw[k] !== false) : txt(raw[k], def[k], k === 'name' ? 60 : 600);
    });
    return out;
  }
  function normalizeOrder(order) {
    var seen = {};
    return (Array.isArray(order) ? order : []).map(function (k) { return String(k == null ? '' : k).trim(); })
      .filter(function (k) { if (!k || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 60);
  }
  /* тексты и порядок из calc (как сохранено в админке) с подстановкой значений по умолчанию */
  function normalizeUi(calc) {
    calc = calc && typeof calc === 'object' ? calc : {};
    return {
      monument: group(calc.monument, DEF.monument),
      dimensions: group(calc.dimensions, DEF.dimensions),
      contact: group(calc.contact, DEF.contact),
      summary: group(calc.summary, DEF.summary),
      order: normalizeOrder(calc.order)
    };
  }
  /* Последовательность шагов: сохранённый порядок, недостающие блоки — на привычные места
     (памятник первым, размеры сразу после него), новые обычные шаги — в конец. */
  function sequence(customIds, opts) {
    opts = opts || {};
    var keys = [];
    if (opts.monument !== false) keys.push(MONUMENT);
    if (opts.dimensions !== false) keys.push(DIMENSIONS);
    (customIds || []).forEach(function (id) { id = String(id); if (id && keys.indexOf(id) < 0 && id !== 'monument') keys.push(id); });
    var out = normalizeOrder(opts.order).filter(function (k) { return keys.indexOf(k) > -1; });
    keys.forEach(function (k) {
      if (out.indexOf(k) > -1) return;
      if (k === MONUMENT) out.unshift(k);
      else if (k === DIMENSIONS) out.splice(out.indexOf(MONUMENT) + 1, 0, k);
      else out.push(k);
    });
    return out;
  }
  return { MONUMENT: MONUMENT, DIMENSIONS: DIMENSIONS, DEFAULTS: DEF, normalizeUi: normalizeUi, normalizeOrder: normalizeOrder, sequence: sequence };
});
