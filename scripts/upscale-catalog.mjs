import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const sourceDir = path.join(root, 'assets', 'catalog');
const backupDir = path.join(root, 'assets', 'catalog-originals');
const targetLongEdge = 7680;
const files = (await fs.readdir(sourceDir))
  .filter((name) => /\.webp$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (files.length < 200) {
  throw new Error(`Expected the full catalog (about 247 WebP files); found only ${files.length}. Refusing a partial run.`);
}

await fs.mkdir(backupDir, { recursive: true });
let processed = 0;
let skipped = 0;
let sourceBytes = 0;
let outputBytes = 0;

for (const name of files) {
  const source = path.join(sourceDir, name);
  const backup = path.join(backupDir, name);
  const temp = path.join(sourceDir, `.upscale-${name}`);
  const meta = await sharp(source, { limitInputPixels: 100_000_000 }).metadata();

  if (!meta.width || !meta.height || meta.format !== 'webp') {
    throw new Error(`Invalid WebP source: ${name}`);
  }

  if (Math.max(meta.width, meta.height) >= targetLongEdge) {
    skipped++;
    console.log(`SKIP already high-res: ${name} ${meta.width}x${meta.height}`);
    continue;
  }

  try {
    await fs.access(backup);
  } catch {
    // Immutable first-generation backup: never replace it on subsequent runs.
    await fs.copyFile(source, backup);
  }

  const inputSize = (await fs.stat(source)).size;
  const scale = targetLongEdge / Math.max(meta.width, meta.height);
  const width = Math.round(meta.width * scale);
  const height = Math.round(meta.height * scale);

  await sharp(source, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width, height, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.5, m1: 0.22, m2: 0.55, x1: 2, y2: 10, y3: 20 })
    .webp({ quality: 94, effort: 5, smartSubsample: true })
    .toFile(temp);

  const outputMeta = await sharp(temp).metadata();
  if (Math.max(outputMeta.width || 0, outputMeta.height || 0) < targetLongEdge - 2) {
    throw new Error(`Output size check failed for ${name}: ${outputMeta.width}x${outputMeta.height}`);
  }

  await fs.rename(temp, source);
  const outputSize = (await fs.stat(source)).size;
  processed++;
  sourceBytes += inputSize;
  outputBytes += outputSize;
  console.log(`DONE ${name}: ${meta.width}x${meta.height} -> ${outputMeta.width}x${outputMeta.height}; ${inputSize} -> ${outputSize} bytes`);
}

const backedUp = (await fs.readdir(backupDir)).filter((name) => /\.webp$/i.test(name)).length;
if (backedUp !== files.length) {
  throw new Error(`Backup count mismatch: expected ${files.length}, found ${backedUp}`);
}
console.log(JSON.stringify({
  catalogFiles: files.length,
  processed,
  skippedAlreadyHighResolution: skipped,
  originalsBackedUp: backedUp,
  sourceBytesProcessed: sourceBytes,
  outputBytesWritten: outputBytes,
  targetLongEdge
}, null, 2));
