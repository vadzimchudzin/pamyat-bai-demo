# Варианты гранита из проходов рендера (Python из Blender: numpy + OpenImageIO).
# python3.11 post.py <exr | parts_json> <out_dir> <code> <ids_json> [opts_json] → <out_dir>/<code>-<id>.webp и <out_dir>/sm/<code>-<id>.webp (½)
import OpenImageIO as oiio, numpy as np, sys, json, os
exr, out_dir, code = sys.argv[1], sys.argv[2], sys.argv[3]
ids = json.loads(sys.argv[4]); opts = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}
def read(f):
    inp = oiio.ImageInput.open(f); sp = inp.spec(); nm = list(sp.channelnames)
    v = np.asarray(inp.read_image(0, 0, 0, sp.nchannels, 'float')).reshape(sp.height, sp.width, sp.nchannels); inp.close()
    return nm, v
if exr.startswith('{'):
    # кадр из частей (build.py region, run.py): {"res": R, "m": перекрытие, "parts": [[exr, x0, y0], ...]};
    # у каждой части шумодав свой, поэтому стык — плавный переход ±B px посередине перекрытия
    J = json.loads(exr); R, mg = J['res'], J['m']; B = max(1.0, min(24.0, mg / 2)); names = px = None; W = np.zeros((R, R, 1), np.float32)
    def wt(o, n):
        c = np.arange(o, o + n, dtype=np.float32); w = np.ones(n, np.float32)
        if o > 0: w *= np.clip((c - (o + mg - B)) / (2 * B), 0, 1)
        if o + n < R: w *= np.clip(((o + n - mg + B) - c) / (2 * B), 0, 1)
        return w
    for f, x0, y0 in J['parts']:
        nm, v = read(f); h, w_ = v.shape[:2]
        if x0 + w_ > R or y0 + h > R: raise SystemExit('part %s: %dx%d at %d,%d exceeds %d' % (f, w_, h, x0, y0, R))
        if names is None: names = nm; px = np.zeros((R, R, len(nm)), np.float32)
        v = v[:, :, [nm.index(c) for c in names]]
        k = (wt(y0, h)[:, None] * wt(x0, w_)[None, :])[..., None]
        px[y0:y0 + h, x0:x0 + w_] += v * k; W[y0:y0 + h, x0:x0 + w_] += k; del v
    if float(W.min()) < 0.999: raise SystemExit('parts do not cover the frame')
    px /= W; del W
else:
    names, px = read(exr)
def ch(layer, comps='RGB'):
    return np.stack([px[:, :, names.index('%s.%s' % (layer, c))] for c in comps], -1)
a = np.clip(px[:, :, names.index('Alpha.V')][..., None], 0, 1)
DL = ch('DL'); GL = ch('GL'); SC = ch('SC'); IMG = ch('Image')
# лицевая грань стелы: блики и резьба с исходного фото (pg) вместо собственных бликов рендера (вес fw)
PG = ch('pg') if 'pg.R' in names else np.zeros_like(GL)
FW = np.clip(px[:, :, names.index('fw.V')][..., None] / np.maximum(a, 1e-4), 0, 1) if 'fw.V' in names else np.zeros_like(a)
GLX = GL * (1 - FW) + PG
# затенение углублений резьбы (по фото) — только для рассеянного света лицевой грани
CV = np.clip(px[:, :, names.index('cv.V')][..., None] / np.maximum(a, 1e-4), 0, 1) if 'cv.V' in names else np.ones_like(a)
DLC = DL * np.where(a > 1e-4, CV, 1)
scm = np.clip(1 - opts.get('shadow', 0.8) * (1 - np.clip(SC, 0, 1.0)), 0, 1)
def srgb(x):
    x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)
def save(lin, path, q):
    arr = srgb(lin); o = oiio.ImageOutput.create(path); s = oiio.ImageSpec(arr.shape[1], arr.shape[0], 3, 'uint8')
    s.attribute('Compression', 'webp:%d' % q); o.open(path, s)
    o.write_image(np.ascontiguousarray((arr * 255 + 0.5).clip(0, 255).astype(np.uint8))); o.close()
os.makedirs(os.path.join(out_dir, 'sm'), exist_ok=True)
for k, vid in enumerate(ids):
    A = ch('g%d' % k) / np.maximum(a, 1e-4)
    out = A * DLC + GLX + (1 - a) * scm  # гранит × свет + блики, белый фон × тень
    save(out, os.path.join(out_dir, '%s-%s.webp' % (code, vid)), opts.get('q', 82))
    h, w = out.shape[0] // 2 * 2, out.shape[1] // 2 * 2
    sm = out[:h, :w].reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))
    save(sm, os.path.join(out_dir, 'sm', '%s-%s.webp' % (code, vid)), opts.get('q_sm', 80))
m = a[..., 0] > 0.99
if m.any():
    base = (ch('g0') / np.maximum(a, 1e-4)) * DL + GL
    print('recon', float(np.abs(base - IMG)[m].mean()))
