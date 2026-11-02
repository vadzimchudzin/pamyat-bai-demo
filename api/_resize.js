/* Уменьшение фото «на лету» (?w=): ширина из короткого списка — чтобы кэш CDN не дробился.
   sharp подключается лениво; если его нет или что-то пошло не так — отдаём оригинал. */
'use strict';
const WIDTHS = [360, 480, 640, 720, 960, 1200, 1600, 1800, 2400];
function pickWidth(q) {
  const w = parseInt(q, 10);
  if (!w || w <= 0) return 0;
  return WIDTHS.find(x => x >= w) || WIDTHS[WIDTHS.length - 1];
}
let sharpLib;
function sharp() {
  if (sharpLib === undefined) { try { sharpLib = require('sharp'); } catch (e) { sharpLib = null; } }
  return sharpLib;
}
/* → { buf, type } ; при ошибке — исходные данные. Всегда webp (его понимают все актуальные браузеры). */
async function resize(buf, type, width) {
  const s = sharp();
  if (!s || !width || !/^image\/(jpe?g|png|webp|avif)$/i.test(type || '')) return { buf, type, resized: false };
  try {
    const img = s(buf, { failOn: 'none' }).rotate();
    const data = await img.resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer();
    if (data.length >= buf.length) return { buf, type, resized: false };
    return { buf: data, type: 'image/webp', resized: true };
  } catch (e) {
    return { buf, type, resized: false };
  }
}
module.exports = { WIDTHS, pickWidth, resize };
