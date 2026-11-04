# Варианты гранита из проходов рендера (Python из Blender: numpy + OpenImageIO).
# python3.11 post.py <exr> <out_dir> <code> <ids_json> [opts_json] → <out_dir>/<code>-<id>.webp и <out_dir>/sm/<code>-<id>.webp (½)
import OpenImageIO as oiio, numpy as np, sys, json, os
exr, out_dir, code = sys.argv[1], sys.argv[2], sys.argv[3]
ids = json.loads(sys.argv[4]); opts = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}
inp = oiio.ImageInput.open(exr); sp = inp.spec(); names = list(sp.channelnames)
px = np.asarray(inp.read_image(0, 0, 0, sp.nchannels, 'float')).reshape(sp.height, sp.width, sp.nchannels); inp.close()
def ch(layer, comps='RGB'):
    return np.stack([px[:, :, names.index('%s.%s' % (layer, c))] for c in comps], -1)
a = np.clip(px[:, :, names.index('Alpha.V')][..., None], 0, 1)
DL = ch('DL'); GL = ch('GL'); SC = ch('SC'); IMG = ch('Image')
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
    out = A * DL + GL + (1 - a) * scm  # гранит × свет + блики, белый фон × тень
    save(out, os.path.join(out_dir, '%s-%s.webp' % (code, vid)), opts.get('q', 82))
    h, w = out.shape[0] // 2 * 2, out.shape[1] // 2 * 2
    sm = out[:h, :w].reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))
    save(sm, os.path.join(out_dir, 'sm', '%s-%s.webp' % (code, vid)), opts.get('q_sm', 80))
m = a[..., 0] > 0.99
if m.any():
    base = (ch('g0') / np.maximum(a, 1e-4)) * DL + GL
    print('recon', float(np.abs(base - IMG)[m].mean()))
