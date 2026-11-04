# Кадры Blender (dove.py) → лента 13×(128×184): среднее подкадров, общий кроп, высветление теней, WebP.
# Итог для сайта — out/dove-flap-q82.webp → assets/img/dove-flap.webp (размер кадра — в css/fx.css, .dove-sp).
import glob, os, sys, json
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'frames')
OUTD = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'out')
TW = int(os.environ.get('TW', 128))
os.makedirs(OUTD, exist_ok=True)
frames = []
for f in range(13):
    subs = sorted(glob.glob(os.path.join(SRC, 'f%02d_*.png' % f)))
    acc = None
    for p in subs:
        a = np.asarray(Image.open(p).convert('RGBA'), dtype=np.float64) / 255.0
        pm = a.copy(); pm[..., :3] *= pm[..., 3:4]          # premultiplied
        acc = pm if acc is None else acc + pm
    acc /= len(subs)
    LIFT = float(os.environ.get('LIFT', 0.55))  # высветлить тени: белый голубь на светлом небе
    if LIFT < 1:
        a_ = acc[..., 3:4]; col = np.where(a_ > 1e-4, acc[..., :3] / np.maximum(a_, 1e-4), 0)
        col = 1 - (1 - np.clip(col, 0, 1)) * LIFT
        acc[..., :3] = col * a_
    frames.append(acc)
H0, W0 = frames[0].shape[:2]
al = np.max(np.stack([fr[..., 3] for fr in frames]), axis=0)
ys, xs = np.where(al > 0.004)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
cw, chh = x1 - x0, y1 - y0
m = int(round(cw * 0.035))
x0 -= m; x1 += m; y0 -= m; y1 += m
cw, chh = x1 - x0, y1 - y0
TH = int(round(chh * TW / cw))
# подогнать высоту кропа под целые пиксели
chh2 = TH * cw / TW; d = (chh2 - chh) / 2; y0 = int(round(y0 - d)); y1 = int(round(y1 + d))
print('crop', x0, y0, x1, y1, 'src', W0, H0, '->', TW, TH)
sheet = Image.new('RGBa', (TW * len(frames), TH), (0, 0, 0, 0))
for i, fr in enumerate(frames):
    pad = np.zeros((max(y1, H0) - min(y0, 0), max(x1, W0) - min(x0, 0), 4))
    oy, ox = -min(y0, 0), -min(x0, 0)
    pad[oy:oy + H0, ox:ox + W0] = fr
    crop = pad[y0 + oy:y1 + oy, x0 + ox:x1 + ox]
    im = Image.fromarray(np.clip(crop * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBa')
    im = im.resize((TW, TH), Image.LANCZOS)
    sheet.paste(im, (i * TW, 0))
sheet = sheet.convert('RGBA')
sheet.save(os.path.join(OUTD, 'dove-flap.png'), optimize=True)
for q in (82, 90):
    sheet.save(os.path.join(OUTD, 'dove-flap-q%d.webp' % q), 'WEBP', quality=q, method=6, alpha_quality=90)
sheet.save(os.path.join(OUTD, 'dove-flap-ll.webp'), 'WEBP', lossless=True, method=6, quality=100)
for fn in sorted(os.listdir(OUTD)):
    print(fn, os.path.getsize(os.path.join(OUTD, fn)))
json.dump({'tw': TW, 'th': TH, 'n': len(frames)}, open(os.path.join(OUTD, 'meta.json'), 'w'))
