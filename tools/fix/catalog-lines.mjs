// ПАМЯТЬ.БАЙ — убирает тонкую серую линию над памятником (артефакт исходных фото каталога).
//   node tools/fix/catalog-lines.mjs <assets/catalog> <CODE...>
// Линия ищется в верхних 14% кадра: полоса до 0,9% высоты, почти во всю ширину, сверху и снизу — белый фон.
// Полоса закрашивается фоном (плавно между строками над и под ней), затем заново пишутся 4K / md / sm.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SIZES = { full: 3840, md: 1600, sm: 640 };
const Q = { full: 84, md: 82, sm: 78 };
const [dir, ...codes] = process.argv.slice(2);
if (!dir || !codes.length) { console.error('usage: catalog-lines.mjs <dir> CODE...'); process.exit(2); }

function rowInk(data, w, y) {
  let n = 0;
  for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; if (data[i] + data[i + 1] + data[i + 2] < 3 * 236) n++; }
  return n / w;
}
function findLine(data, w, h) {
  const lim = Math.round(h * 0.14), maxT = Math.max(4, Math.round(h * 0.009)), gap = Math.max(4, Math.round(h * 0.006));
  const ink = []; for (let y = 0; y < lim + gap + maxT; y++) ink.push(rowInk(data, w, y));
  for (let y = gap; y < lim; y++) {
    if (ink[y] < 0.5) continue;
    let s = y, e = y;
    while (s - 1 >= 0 && ink[s - 1] >= 0.02 && e - s < maxT) s--;
    while (e + 1 < ink.length && ink[e + 1] >= 0.02 && e - s < maxT) e++;
    if (e - s >= maxT) { y = e; continue; }                          // толстая полоса — это уже памятник
    const above = ink.slice(Math.max(0, s - gap), s), below = ink.slice(e + 1, e + 1 + gap);
    if (above.length && above.every(v => v < 0.02) && below.length === gap && below.every(v => v < 0.02)) return [s, e];
    y = e;
  }
  return null;
}
async function writeSizes(input, code) {
  const meta = await sharp(input).metadata(), long = Math.max(meta.width, meta.height);
  for (const [k, L] of Object.entries(SIZES)) {
    const r = L / long, w = Math.round(meta.width * r), h = Math.round(meta.height * r);
    const out = k === 'full' ? dir : path.join(dir, k);
    await fs.mkdir(out, { recursive: true });
    let img = sharp(input).resize({ width: w, height: h, fit: 'fill', kernel: sharp.kernel.lanczos3 });
    if (k !== 'full') img = img.sharpen({ sigma: 0.5, m1: 0.3, m2: 0.9 });
    await img.webp({ quality: Q[k], effort: 5, smartSubsample: true }).toFile(path.join(out, code + '.webp'));
  }
}
let fixed = 0;
for (const code of codes) {
  const f = path.join(dir, code + '.webp');
  try { await fs.access(f); } catch { console.log(code, 'нет файла'); continue; }
  const { data, info } = await sharp(f).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, band = findLine(data, w, h);
  if (!band) { console.log(code, 'линия не найдена — не трогаем'); continue; }
  const pad = Math.max(3, Math.round(h * 0.004)), y0 = Math.max(0, band[0] - pad), y1 = Math.min(h - 1, band[1] + pad);
  const a = Math.max(0, y0 - 1), b = Math.min(h - 1, y1 + 1), k = Math.max(2, Math.round(h * 0.002));
  // фон по столбцу — самый светлый пиксель из нескольких строк над и под полосой (без пылинок от сжатия)
  const bg = (y, dir, x, c) => { let m = 0; for (let j = 0; j <= k; j++) { const yy = Math.min(h - 1, Math.max(0, y + dir * j)); m = Math.max(m, data[(yy * w + x) * 3 + c]); } return m; };
  const top = new Uint8Array(w * 3), bot = new Uint8Array(w * 3);
  for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { top[x * 3 + c] = bg(a, -1, x, c); bot[x * 3 + c] = bg(b, 1, x, c); }
  for (let y = a; y <= b; y++) {
    const t = (y - a) / Math.max(1, b - a);
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) data[(y * w + x) * 3 + c] = Math.round(top[x * 3 + c] * (1 - t) + bot[x * 3 + c] * t);
  }
  const png = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  await writeSizes(png, code);
  fixed++; console.log(code, `линия y=${band[0]}–${band[1]} из ${h} → убрана`);
}
console.log('fixed:', fixed, 'of', codes.length);
