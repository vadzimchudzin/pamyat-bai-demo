/* Non-generative 8K derivative for catalog lightbox images.
   Keeps the original file untouched, returns WebP and lets the CDN cache the result. */
const sharp = require('sharp');

module.exports = async function catalogImage(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end('Method not allowed');
  }

  const rawName = req.query && req.query.name;
  const name = Array.isArray(rawName) ? rawName[0] : rawName;
  if (typeof name !== 'string' || !/^[A-Z]\d{1,3}\.webp$/i.test(name)) {
    res.statusCode = 400;
    return res.end('Invalid catalog image name');
  }

  try {
    // Always read the original catalog file from the stable public site host.
    // Using VERCEL_URL here can return a protected deployment/login HTML page.
    const sourceUrl = 'https://pamyat-bai-demo.vercel.app/assets/catalog/' + encodeURIComponent(name);
    const response = await fetch(sourceUrl);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!response.ok || !contentType.includes('image/')) {
      res.statusCode = response.status === 404 ? 404 : 502;
      console.error('catalog source rejected', { name, status: response.status, contentType });
      return res.end('Catalog image unavailable');
    }

    const input = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(input, { limitInputPixels: 20000000 }).metadata();
    if (!metadata.width || !metadata.height) {
      res.statusCode = 415;
      return res.end('Unsupported image');
    }

    const scale = 7680 / Math.max(metadata.width, metadata.height);
    const width = Math.max(1, Math.round(metadata.width * scale));
    const height = Math.max(1, Math.round(metadata.height * scale));

    // Lanczos resampling with very mild edge sharpening; no AI-generated details.
    const output = await sharp(input, { limitInputPixels: 20000000 })
      .resize({ width, height, fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .sharpen({ sigma: 0.4, m1: 0.2, m2: 0.35 })
      .webp({ quality: 92, effort: 4 })
      .toBuffer();

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400');
    res.setHeader('X-Catalog-Image-Width', String(width));
    res.setHeader('X-Catalog-Image-Height', String(height));
    res.statusCode = 200;
    if (req.method === 'HEAD') return res.end();
    return res.end(output);
  } catch (error) {
    console.error('catalog-image upscale failed:', error && error.message ? error.message : error);
    res.statusCode = 500;
    return res.end('Unable to process catalog image');
  }
};
