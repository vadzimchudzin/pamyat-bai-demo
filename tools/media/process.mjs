// ПАМЯТЬ.БАЙ — подготовка фото каталога (запускается в workflow catalog-media.yml).
//   topng <list.txt> <dir>          webp/jpg → png на белом фоне (вход для Real-ESRGAN)
//   catalog <ai_dir> <out_dir>      AI ×4 → <code>.webp (4K), md/<code>.webp (1600), sm/<code>.webp (640)
//   accessories <png_dir> <out_dir> рендеры Blender (RGBA + тень) → белый фон, те же размеры
//   manifest <assets_catalog_dir>   variants.json — список кодов с готовыми размерами
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SIZES = { full: 3840, md: 1600, sm: 640 };
const Q = { full: 84, md: 82, sm: 78 };
const [cmd, a, b] = process.argv.slice(2);

async function writeSizes(input, out, code) {
  const meta = await sharp(input).metadata();
  const long = Math.max(meta.width, meta.height);
  const res = {};
  for (const [k, L] of Object.entries(SIZES)) {
    const r = L / long, w = Math.round(meta.width * r), h = Math.round(meta.height * r);
    const dir = k === 'full' ? out : path.join(out, k);
    await fs.mkdir(dir, { recursive: true });
    let img = sharp(input).resize({ width: w, height: h, fit: 'fill', kernel: sharp.kernel.lanczos3 });
    if (k !== 'full') img = img.sharpen({ sigma: 0.5, m1: 0.3, m2: 0.9 });
    await img.webp({ quality: Q[k], effort: 5, smartSubsample: true }).toFile(path.join(dir, code + '.webp'));
    if (k === 'full') res.size = [w, h];
  }
  return res.size;
}

if (cmd === 'topng') {
  const list = (await fs.readFile(a, 'utf8')).split('\n').map(s => s.trim()).filter(Boolean);
  await fs.mkdir(b, { recursive: true });
  for (const f of list) {
    const code = path.basename(f).replace(/\.[^.]+$/, '');
    const m = await sharp(f).metadata();
    let img = sharp(f).flatten({ background: '#ffffff' });
    // нет оригинала — берём уже увеличенное фото, но уменьшаем до разумного входа для ×4
    if (Math.max(m.width, m.height) > 1200) img = img.resize({ width: m.width >= m.height ? 960 : null, height: m.height > m.width ? 960 : null, kernel: sharp.kernel.lanczos3 });
    await img.png().toFile(path.join(b, code + '.png'));
  }
  console.log('png:', list.length);
} else if (cmd === 'catalog' || cmd === 'accessories') {
  const files = (await fs.readdir(a)).filter(f => f.endsWith('.png')).sort();
  const done = {};
  for (const f of files) {
    const code = f.replace(/\.png$/, ''), src = path.join(a, f);
    let input = src;
    if (cmd === 'accessories') {
      // тень от «ловца теней» — полупрозрачный чёрный; делаем её мягче и кладём на белый фон
      const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += 4) {
        const al = data[i + 3];
        if (al < 250 && data[i] < 40 && data[i + 1] < 40 && data[i + 2] < 40) data[i + 3] = Math.round(al * 0.55);
      }
      input = await sharp(data, { raw: info }).flatten({ background: '#ffffff' }).png().toBuffer();
    } else {
      input = await sharp(src).flatten({ background: '#ffffff' }).png().toBuffer();
    }
    done[code] = await writeSizes(input, b, code);
    console.log(code, done[code].join('x'));
  }
  await fs.writeFile(path.join(b, `.done-${cmd}-${Date.now()}.json`), JSON.stringify(done));
} else if (cmd === 'manifest') {
  const items = {};
  for (const f of (await fs.readdir(a)).filter(f => f.endsWith('.webp')).sort()) {
    const code = f.replace(/\.webp$/, '');
    try {
      await fs.access(path.join(a, 'md', f)); await fs.access(path.join(a, 'sm', f));
      const m = await sharp(path.join(a, f)).metadata();
      items[code] = [m.width, m.height];
    } catch { /* нет уменьшенных копий — сайт возьмёт оригинал */ }
  }
  await fs.writeFile(path.join(a, 'variants.json'), JSON.stringify({ v: 1, sizes: SIZES, items }) + '\n');
  console.log('manifest items:', Object.keys(items).length);
} else {
  console.error('usage: process.mjs topng|catalog|accessories|manifest ...'); process.exit(2);
}
