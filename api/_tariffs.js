/* ПАМЯТЬ.БАЙ — тарифы благоустройства из смет владельца (цена клиента за 1 м²).
   Только сервер и админка: себестоимость (мастер, материалы) клиенту не уходит —
   publicContent() → PP.sanitizeCalcForPublic() оставляет на сайте только готовые ставки.

   Позиции — «кривая» без постоянной части: цена = площадь × ставка за м².
   Затраты за 1 м² = мастер за м² + материалы базового участка / его площадь;
   наценка подобрана так, чтобы ставка для клиента была ровно perM2.
   estimate.rows — таблица из сметы (длина, ширина, материалы) для прибыли в админке. */
'use strict';
const PP = require('../js/pricing.js');

const VERSION = 1;
const SIZES = [[1.4, 2.0], [1.5, 2.1], [1.4, 2.3], [1.8, 2.0], [2.0, 2.0], [2.4, 1.8], [2.0, 2.2], [3.0, 2.2]];
const PACKAGES = [
  { id: 'pkg-paving', name: 'Тротуарная плитка + стяжка 5 см + борта',
    note: 'Бетонная стяжка 5 см, борта по периметру, тротуарная плитка. Работа и материалы включены.',
    perM2: 500, master: 60, materials: [243, 276, 284, 301, 335, 362, 363, 523] },
  { id: 'pkg-tile30', name: 'Монолит 15 см + керамогранит 30×30',
    note: 'Армированный монолит 15 см, керамогранит 30×30 на клею. Работа и материалы включены.',
    perM2: 660, master: 105, materials: [412, 430, 438, 488, 540, 579, 588, 825] },
  { id: 'pkg-tile60', name: 'Монолит 15 см + керамогранит 60×60',
    note: 'Армированный монолит 15 см, крупный керамогранит 60×60. Работа и материалы включены.',
    perM2: 660, master: 105, materials: [401, 418, 425, 473, 524, 562, 571, 800] }
];
const PACKAGE_IDS = PACKAGES.map(p => p.id);
const STEP = {
  id: 'land', name: 'Благоустройство', type: 'radio',
  sub: 'Цена за 1 м² по нашим сметам: работа и материалы включены. Если основание уже есть — выберите установку на готовое.'
};
const READY = { id: 'ready', name: 'Установка на готовое основание', price: 300, pricing: { mode: 'fixed' } };

function round(n, d) { const k = Math.pow(10, d); return Math.round(n * k) / k; }
/* материалы для площади a: линейно между строками сметы (за краями — по крайнему отрезку) */
function materialsAt(p, a) {
  const pts = SIZES.map((s, i) => [s[0] * s[1], p.materials[i]]).sort((x, y) => x[0] - y[0]);
  let i = 1;
  while (i < pts.length - 1 && a > pts[i][0]) i++;
  const [a0, m0] = pts[i - 1], [a1, m1] = pts[i];
  return a1 === a0 ? m0 : m0 + (m1 - m0) * (a - a0) / (a1 - a0);
}
function packageItem(p, base) {
  const b = PP.normalizeBase(base), area = b.length * b.width;
  const costUnit = round(p.master + materialsAt(p, area) / area, 4);
  const markup = round(p.perM2 / costUnit, 6);
  return {
    id: p.id, name: p.name, note: p.note,
    price: PP.roundTo(p.perM2 * area, b.round),
    pricing: { mode: 'curve', quantity: 'area', curve: {
      share: 1, piece: 0, costFixed: 0, costUnit: costUnit, reserve: 0, markup: markup, min: 0,
      trim: { enabled: false, tileA: 60, tileB: 50, material: 0, cut: 0 } } },
    estimate: { perM2: p.perM2, master: p.master, rows: SIZES.map((s, i) => [s[0], s[1], p.materials[i]]) }
  };
}
function landStep(base, ready) {
  return Object.assign({}, STEP, { items: PACKAGES.map(p => packageItem(p, base)).concat([ready || READY]) });
}

/* Однократный перенос калькулятора на тарифы из смет (идемпотентно).
   Старые шаги «Основание» и «Благоустройство» заменяются одним шагом с пакетами;
   «Установка на готовое основание» переносится как есть. Остальные шаги не трогаем.
   После сохранения в админке метка tariffVersion остаётся, и перенос больше не запускается. */
function migrateCalc(calc) {
  if (!calc || typeof calc !== 'object' || !Array.isArray(calc.steps)) return calc;
  if (Number(calc.tariffVersion) >= VERSION) return calc;
  const c = JSON.parse(JSON.stringify(calc));
  c.tariffVersion = VERSION;
  const has = c.steps.some(s => (s.items || []).some(it => PACKAGE_IDS.indexOf(it.id) > -1));
  if (!has) {
    const fi = c.steps.findIndex(s => s.id === 'foundation'), li = c.steps.findIndex(s => s.id === 'land');
    const oldReady = fi > -1 ? (c.steps[fi].items || []).find(it => it.id === 'ready') : null;
    const at = [fi, li].filter(i => i > -1), pos = at.length ? Math.min.apply(null, at) : 0;
    c.steps = c.steps.filter(s => s.id !== 'foundation' && s.id !== 'land');
    c.steps.splice(Math.min(pos, c.steps.length), 0, landStep(c.base, oldReady));
  }
  c.dimensions = Object.assign({}, c.dimensions || {});
  if (!Array.isArray(c.dimensions.presets)) c.dimensions.presets = SIZES.map(s => s.slice());
  return c;
}

module.exports = { VERSION, SIZES, PACKAGES, PACKAGE_IDS, READY, materialsAt, packageItem, landStep, migrateCalc };
