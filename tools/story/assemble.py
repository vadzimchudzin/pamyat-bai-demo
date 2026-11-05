#!/usr/bin/env python3
# «От разметки до сдачи» — сборка ролика для сайта из кусков рендера (scene.py).
# 1) Истинные кадры RGBA: кадр f = кадр f-1, в котором заменены отрендеренные области (inner) кадра f.
# 2) Композит поверх фото-фона (plate): тёплый грейд объектов, «подсветка краёв» светом фона, голубоватые тени,
#    статичное зерно (одинаковое в каждом кадре — не мерцает).
# 3) Дельта-кадры для сайта: f####.webp — атлас прямоугольников, изменившихся относительно предыдущего кадра
#    (и там, где накопилась ошибка сжатия); каждые KEY кадров — k####.webp: всё, чем кадр отличается от фона
#    (быстрый переход в любое место ролика). Плеер (js/story.js) собирает кадр: фон + ключ + дельты.
#    meta.json: {v:2, count, w, h, key, frames:[[[x,y,w,h,ax,ay],…],…], keys:{k:[…]}, flow:[…]}
#   python3 assemble.py --src <куски> --plate plate1920.png --out <assets> [--sizes 1920x1080:story,1280x720:story-m]
import argparse, json, os, io, sys, time
import numpy as np, cv2
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--plate', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--sizes', default='1920x1080:story,1280x720:story-m')
ap.add_argument('--key', type=int, default=40)
ap.add_argument('--q', default='86,84')          # качество webp по размерам
ap.add_argument('--count', type=int, default=0)  # число кадров (0 — по файлам)
ap.add_argument('--start', type=int, default=0)  # первый кадр рендера (тест куска; на выходе нумерация с 0)
ap.add_argument('--preview', default='')         # папка для jpg-превью отдельных кадров (проверка)
ap.add_argument('--pframes', default='')
ap.add_argument('--thr', type=float, default=3)    # порог заметного изменения (после размытия σ=1)
ap.add_argument('--noalpha', action='store_true')  # тест: дельты без маски прозрачности
ap.add_argument('--rev', default=os.environ.get('GITHUB_RUN_ID') or str(int(time.time())))   # версия файлов для кэша браузера (?r=)
A = ap.parse_args()

def log(*a): print(*a, flush=True)

# ---------------------------------------------------------------- кадры рендера
metas = {}
for fn in os.listdir(A.src):
    if fn.startswith('r') and fn.endswith('.json'):
        m = json.load(open(os.path.join(A.src, fn))); metas[m['f']] = m
S0 = A.start
N = A.count or (max(metas) + 1 - S0)
miss = [f for f in range(S0, S0 + N) if f not in metas]
if miss: sys.exit('нет кадров: %s' % miss[:20])
RW, RH = metas[S0]['w'], metas[S0]['h']
log('кадров', N, 'рендер', RW, RH)

plate = cv2.imread(A.plate, cv2.IMREAD_COLOR)
if plate.shape[1] != RW: plate = cv2.resize(plate, (RW, RH), interpolation=cv2.INTER_AREA)
PL = plate.astype(np.float32) / 255
k = RW / 1280.0
PLB = cv2.GaussianBlur(PL, (0, 0), 6 * k)          # для подсветки краёв
yy = np.linspace(0, 1, RH, dtype=np.float32)[:, None, None]
HAZE = np.array([0.55, 0.78, 0.95], np.float32) * 0.03 * (1 - 0.5 * yy)   # BGR, тёплая дымка
GRAIN = np.random.default_rng(1).normal(0, 0.010, (RH, RW, 1)).astype(np.float32)
SH_TINT = np.array([0.93, 1.0, 1.04], np.float32)   # тени: синий канал темнеет меньше (свет неба)

def comp(R, x0, y0, x1, y1):
    # композит области кадра поверх фона (рамка x0..x1, y0..y1 в пикселях рендера)
    a = R[y0:y1, x0:x1, 3:4]; c = R[y0:y1, x0:x1, :3]
    pl = PL[y0:y1, x0:x1]; plb = PLB[y0:y1, x0:x1]
    # объект (непрозрачный) или тень на «ловце теней» (чёрный с альфой)
    obj = np.clip((cv2.dilate(a[..., 0], np.ones((3, 3), np.uint8)) - 0.90) / 0.08, 0, 1)[..., None]
    g = c * np.float32([0.96, 1.0, 1.02]) * 0.97 + HAZE[y0:y1]
    ab = cv2.GaussianBlur(a[..., 0], (0, 0), 3 * k)[..., None]
    wrap = np.clip(1 - ab, 0, 1) * a ** 4
    g = g + plb * wrap * 0.30
    g = cv2.GaussianBlur(g, (0, 0), 0.40 * k)
    o_obj = g * a + pl * (1 - a)
    o_sh = pl * (1 - a * SH_TINT)
    out = o_obj * obj + o_sh * (1 - obj)
    out = out + GRAIN[y0:y1, x0:x1] * a * obj
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)

def frames_true():
    # кадр f = кадр f-1, где области кадра f заменены новым рендером. Мягкий шов — только по внешней границе
    # объединения областей кадра (там ничего не меняется); общие края соседних областей — без смешивания
    R = np.zeros((RH, RW, 4), np.float32)
    FE = max(2, int(round(0.004 * RW)))
    for f in range(N):
        rects = metas[S0 + f]['rects']
        if not rects: yield f, R, None; continue
        bx0 = min(rc['inner'][0] for rc in rects); by0 = min(rc['inner'][1] for rc in rects)
        bx1 = max(rc['inner'][2] for rc in rects); by1 = max(rc['inner'][3] for rc in rects)
        cx0, cy0 = max(0, bx0 - FE - 1), max(0, by0 - FE - 1); cx1, cy1 = min(RW, bx1 + FE + 1), min(RH, by1 + FE + 1)
        NEW = R[cy0:cy1, cx0:cx1].copy(); Mk = np.zeros(NEW.shape[:2], np.uint8)
        for rc in rects:
            fp = os.path.join(A.src, rc['file'])
            if not os.path.exists(fp): fp = os.path.splitext(fp)[0] + '.webp'      # в CI куски пережаты в webp без потерь
            im = cv2.imread(fp, cv2.IMREAD_UNCHANGED)
            if im is None: sys.exit('нет файла ' + rc['file'])
            ox, oy, ox1, oy1 = rc['outer']; x0, y0, x1, y1 = rc['inner']
            sub = im[y0 - oy:y1 - oy, x0 - ox:x1 - ox].astype(np.float32) / (65535.0 if im.dtype == np.uint16 else 255.0)
            if sub.shape[2] == 3: sub = np.dstack([sub, np.ones(sub.shape[:2], np.float32)])
            NEW[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0] = sub; Mk[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0] = 1
        W = np.clip(cv2.distanceTransform(Mk, cv2.DIST_L2, 3) / FE, 0, 1)[..., None]
        R[cy0:cy1, cx0:cx1] = R[cy0:cy1, cx0:cx1] * (1 - W) + NEW * W
        yield f, R, [bx0, by0, bx1, by1]

# ---------------------------------------------------------------- дельта-кодер
def enc_webp(img, q):
    # BGR или BGRA (прозрачность — без потерь; под прозрачными блоками libwebp сам «выравнивает» цвет)
    im = Image.fromarray(img[..., [2, 1, 0, 3]], 'RGBA') if img.shape[2] == 4 else Image.fromarray(img[..., ::-1])
    b = io.BytesIO(); im.save(b, format='WEBP', quality=q, method=5, exact=False); return b.getvalue()   # method 6 — в 10 раз дольше, размер тот же
def dec_webp(data):
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)

BS = 16
def rects_from_mask(mask, W, H, maxn=8):
    gh, gw = (H + BS - 1) // BS, (W + BS - 1) // BS
    pm = np.zeros((gh * BS, gw * BS), np.uint8); pm[:H, :W] = mask
    blk = pm.reshape(gh, BS, gw, BS).max(axis=(1, 3))
    if not blk.any(): return []
    blk = cv2.dilate(blk, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(blk, 8)
    rs = [[st[i, 0], st[i, 1], st[i, 0] + st[i, 2], st[i, 1] + st[i, 3]] for i in range(1, n)]
    area = lambda r: (r[2] - r[0]) * (r[3] - r[1])
    ch = True
    while ch and len(rs) > 1:
        ch = False
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                a, b = rs[i], rs[j]
                u = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                if area(u) <= 1.15 * (area(a) + area(b)) or not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1]):
                    rs[i] = u; rs.pop(j); ch = True; break
            if ch: break
    while len(rs) > maxn:
        best = None
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                a, b = rs[i], rs[j]; u = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                cost = area(u) - area(a) - area(b)
                if best is None or cost < best[0]: best = (cost, i, j, u)
        _, i, j, u = best; rs[i] = u; rs.pop(j)
    return [[r[0] * BS, r[1] * BS, min(W, r[2] * BS), min(H, r[3] * BS)] for r in rs]

def pack(rects, W):
    # полки: по убыванию высоты; ширина атласа — не больше кадра
    order = sorted(range(len(rects)), key=lambda i: -(rects[i][3] - rects[i][1]))
    pos = [None] * len(rects); x = y = sh = 0; aw = 0
    for i in order:
        w = rects[i][2] - rects[i][0]; h = rects[i][3] - rects[i][1]
        if x + w > W: y += sh; x = 0; sh = 0
        pos[i] = (x, y); x += w; sh = max(sh, h); aw = max(aw, x)
    return pos, aw, y + sh

def blur16(im): return cv2.GaussianBlur(im, (0, 0), 1.0).astype(np.int16)
THR = A.thr      # порог заметного изменения (после размытия σ=1), уровни 0..255
BA = 8           # блоки маски прозрачности в дельтах: внутри прямоугольника отправляем только изменившиеся блоки 8×8

class Enc:
    # Tref — истинный кадр на момент последней отправки пикселя: дельта уходит, когда кадр заметно ушёл от
    # отправленного (так не копится ни дрейф мелких изменений, ни ошибка сжатия — она не «пересылается» каждый кадр)
    def __init__(self, W, H, name, q):
        self.W, self.H, self.q = W, H, q
        self.dir = os.path.join(A.out, name); os.makedirs(self.dir, exist_ok=True)
        for fn in os.listdir(self.dir):
            if fn.endswith('.webp') or fn == 'meta.json': os.remove(os.path.join(self.dir, fn))
        pl = cv2.resize(plate, (W, H), interpolation=cv2.INTER_AREA) if plate.shape[1] != W else plate.copy()
        data = enc_webp(pl, 90); open(os.path.join(self.dir, 'plate.webp'), 'wb').write(data)
        self.P = dec_webp(data); self.D = self.P.copy()
        self.Tbg = pl; self.Tbgb = blur16(pl); self.Tref = pl.copy()
        self.frames = []; self.keys = {}; self.bytes = len(data)
    def _emit(self, T, mask, path):
        rs = rects_from_mask(mask, self.W, self.H)
        if not rs: return []
        gh, gw = (self.H + BA - 1) // BA, (self.W + BA - 1) // BA
        pm = np.zeros((gh * BA, gw * BA), np.uint8); pm[:self.H, :self.W] = mask
        blk = pm.reshape(gh, BA, gw, BA).max(axis=(1, 3))
        M8 = np.repeat(np.repeat(blk, BA, 0), BA, 1)[:self.H, :self.W] > 0
        if A.noalpha: M8[:] = True
        pos, aw, ah = pack(rs, self.W)
        at = np.zeros((ah, aw, 4), np.uint8)
        for r, p in zip(rs, pos):
            w, h = r[2] - r[0], r[3] - r[1]
            at[p[1]:p[1] + h, p[0]:p[0] + w, :3] = T[r[1]:r[3], r[0]:r[2]]
            at[p[1]:p[1] + h, p[0]:p[0] + w, 3] = M8[r[1]:r[3], r[0]:r[2]] * 255
        if at[..., 3].min() == 255: at = at[..., :3]          # всё непрозрачно — без альфа-канала
        data = enc_webp(at, self.q); open(path, 'wb').write(data); self.bytes += len(data)
        dec = dec_webp(data); out = []
        if dec.shape[2] == 4 and at.shape[2] == 4 and not np.array_equal(dec[..., 3] > 127, at[..., 3] > 127):
            sys.exit('альфа-канал webp искажён')
        for r, p in zip(rs, pos):
            w, h = r[2] - r[0], r[3] - r[1]
            m = M8[r[1]:r[3], r[0]:r[2]]
            self.D[r[1]:r[3], r[0]:r[2]][m] = dec[p[1]:p[1] + h, p[0]:p[0] + w, :3][m]
            self.Tref[r[1]:r[3], r[0]:r[2]][m] = T[r[1]:r[3], r[0]:r[2]][m]
            out.append([int(r[0]), int(r[1]), int(w), int(h), int(p[0]), int(p[1])])
        return out
    def frame(self, f, T, reg):
        # reg — рамка (в пикселях этого размера), вне которой кадр не менялся с прошлого
        mask = np.zeros((self.H, self.W), np.uint8)
        if reg is not None:
            x0, y0 = max(0, reg[0] - 6), max(0, reg[1] - 6); x1, y1 = min(self.W, reg[2] + 6), min(self.H, reg[3] + 6)
            d = np.abs(blur16(T[y0:y1, x0:x1]) - blur16(self.Tref[y0:y1, x0:x1])).max(axis=2)
            mask[y0:y1, x0:x1] = d > THR
        self.frames.append(self._emit(T, mask, os.path.join(self.dir, 'f%04d.webp' % f)))
        if f > 0 and f % A.key == 0:
            self.D = self.P.copy(); self.Tref = self.Tbg.copy()
            dk = np.abs(blur16(T) - self.Tbgb).max(axis=2) > THR
            self.keys[f] = self._emit(T, dk.astype(np.uint8), os.path.join(self.dir, 'k%04d.webp' % f))
    def finish(self, energy):
        e = np.array(energy[1:] + [energy[-1]], np.float64)   # вес перехода f → f+1
        med = float(np.median(e[e > 0])) if (e > 0).any() else 1.0
        flow = np.clip((e / max(med, 1e-6)) ** 0.35, 0.6, 1.8)
        flow = np.convolve(np.pad(flow, 3, mode='edge'), np.ones(7) / 7, mode='valid')
        meta = {'v': 2, 'rev': str(A.rev), 'count': N, 'w': self.W, 'h': self.H, 'key': A.key, 'frames': self.frames,
                'keys': {str(k): v for k, v in self.keys.items()}, 'flow': [round(float(x), 3) for x in flow[:N - 1]]}
        json.dump(meta, open(os.path.join(self.dir, 'meta.json'), 'w'), separators=(',', ':'))
        log(self.dir, 'MB %.1f' % (self.bytes / 1e6), 'файлов', sum(1 for x in self.frames if x) + len(self.keys) + 1)

sizes = []
for s_, q in zip(A.sizes.split(','), A.q.split(',')):
    wh, name = s_.split(':'); w, h = map(int, wh.split('x')); sizes.append(Enc(w, h, name, int(q)))
pset = set(int(x) for x in A.pframes.split(',') if x.strip()) if A.pframes else set()
C = (PL * 255 + 0.5).astype(np.uint8)          # композит текущего кадра (пиксели рендера)
MG = int(13 * k) + 4                           # радиус влияния композита (размытия) на соседние пиксели
energy = []
t0 = time.time()
for f, R, bb in frames_true():
    reg = None
    if bb is not None:
        ix0, iy0, ix1, iy1 = max(0, bb[0] - MG), max(0, bb[1] - MG), min(RW, bb[2] + MG), min(RH, bb[3] + MG)
        cx0, cy0, cx1, cy1 = max(0, bb[0] - 2 * MG), max(0, bb[1] - 2 * MG), min(RW, bb[2] + 2 * MG), min(RH, bb[3] + 2 * MG)
        Cc = comp(R, cx0, cy0, cx1, cy1)[iy0 - cy0:iy1 - cy0, ix0 - cx0:ix1 - cx0]
        energy.append(float(np.abs(Cc.astype(np.int16) - C[iy0:iy1, ix0:ix1].astype(np.int16)).sum()) / (RW * RH * 3))
        C[iy0:iy1, ix0:ix1] = Cc; reg = (ix0, iy0, ix1, iy1)
    else: energy.append(0.0)
    if A.preview and (not pset or f in pset):
        os.makedirs(A.preview, exist_ok=True); cv2.imwrite(os.path.join(A.preview, 'c%04d.jpg' % f), C, [cv2.IMWRITE_JPEG_QUALITY, 92])
    for e in sizes:
        if (e.W, e.H) == (RW, RH): T = C; rg = reg
        else:
            T = cv2.resize(C, (e.W, e.H), interpolation=cv2.INTER_AREA)
            sx, sy = e.W / RW, e.H / RH
            rg = None if reg is None else (max(0, int(reg[0] * sx) - 2), max(0, int(reg[1] * sy) - 2), min(e.W, int(np.ceil(reg[2] * sx)) + 2), min(e.H, int(np.ceil(reg[3] * sy)) + 2))
        e.frame(f, T, rg)
    if f % 50 == 0: log('кадр', f, '%.0fs' % (time.time() - t0))
for e in sizes: e.finish(energy)
log('готово', N, 'кадров за %.0fs' % (time.time() - t0))
