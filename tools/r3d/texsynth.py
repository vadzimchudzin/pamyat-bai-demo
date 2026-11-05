#!/usr/bin/env python3
# Бесшовные плитки гранита из фото образцов (tools/r3d/tex/<id>.jpg): выравнивание освещения фото →
# quilting (Efros–Freeman) с тороидальной склейкой по линии минимальной ошибки → <out>/<id>.png (линейное альбедо, 16 бит)
# и образец для сайта <out>/sw/<id>.jpg. python3 texsynth.py <out_dir> [id ...]
import cv2, numpy as np, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))

def lin(u8):
    x = u8.astype(np.float32) / 255
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)

def srgb(x):
    x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)

def flatten(a, sig):
    # неравномерный свет на фото образца: делим на сглаженную яркость (цвет и зерно остаются)
    L = a.mean(axis=2)
    low = cv2.GaussianBlur(L, (0, 0), sig)
    return a * (L.mean() / np.maximum(low, 1e-4))[..., None]

def seam(err):
    # вертикальная линия минимальной суммарной ошибки (динамика сверху вниз); возвращает x шва для каждой строки
    h, w = err.shape; E = err.copy(); B = np.zeros((h, w), np.int8)
    for y in range(1, h):
        p = E[y - 1]; l = np.r_[np.inf, p[:-1]]; r = np.r_[p[1:], np.inf]
        st = np.stack([l, p, r]); k = st.argmin(0); E[y] += st[k, np.arange(w)]; B[y] = k - 1
    xs = np.zeros(h, np.int32); xs[-1] = int(E[-1].argmin())
    for y in range(h - 1, 0, -1): xs[y - 1] = np.clip(xs[y] + B[y, xs[y]], 0, w - 1)
    return xs

def quilt(src, n_tiles, P, O, seed=1, cand=40, tol=0.12):
    rng = np.random.default_rng(seed)
    H, W = src.shape[:2]; step = P - O; N = n_tiles * step
    out = np.zeros((N, N, 3), np.float32); done = np.zeros((N, N), bool)
    f = 4; sm = cv2.resize(src, (W // f, H // f), interpolation=cv2.INTER_AREA); ps = P // f
    for i in range(n_tiles):
        for j in range(n_tiles):
            ys = (np.arange(P) + i * step) % N; xs = (np.arange(P) + j * step) % N
            cur = out[np.ix_(ys, xs)]; known = done[np.ix_(ys, xs)]
            if not known.any():
                y0 = rng.integers(0, H - P + 1); x0 = rng.integers(0, W - P + 1)
            else:
                # кандидаты: грубый поиск по уменьшенному образцу (matchTemplate с маской перекрытия), затем точная ошибка
                tm = cv2.resize(cur, (ps, ps), interpolation=cv2.INTER_AREA)
                mk = cv2.resize(known.astype(np.float32), (ps, ps), interpolation=cv2.INTER_AREA)
                mk = (mk > 0.5).astype(np.float32)
                r = cv2.matchTemplate(sm, tm, cv2.TM_SQDIFF, mask=np.dstack([mk] * 3))
                r = np.nan_to_num(r, nan=np.inf, posinf=np.inf)
                flat = r.ravel(); k = min(cand, flat.size); idx = np.argpartition(flat, k - 1)[:k]
                best = []
                for t in idx:
                    cy, cx = divmod(int(t), r.shape[1])
                    y0 = min(H - P, cy * f + int(rng.integers(0, f))); x0 = min(W - P, cx * f + int(rng.integers(0, f)))
                    d = ((src[y0:y0 + P, x0:x0 + P] - cur) ** 2).sum(-1)[known].mean()
                    best.append((d, y0, x0))
                best.sort(); lim = best[0][0] * (1 + tol)
                ok = [b for b in best if b[0] <= lim]; _, y0, x0 = ok[int(rng.integers(0, len(ok)))]
            patch = src[y0:y0 + P, x0:x0 + P]
            use = np.ones((P, P), bool)
            if known.any():
                e = ((patch - cur) ** 2).sum(-1)
                # левое/правое перекрытие — вертикальные швы, верх/низ — горизонтальные (по маске известного)
                if known[:, :O].all():
                    xs_ = seam(e[:, :O])
                    for y in range(P): use[y, :xs_[y]] = False
                if known[:, -O:].all():
                    xs_ = seam(e[:, -O:][:, ::-1])
                    for y in range(P): use[y, P - xs_[y]:] = False
                if known[:O, :].all():
                    ys_ = seam(e[:O, :].T)
                    for x in range(P): use[:ys_[x], x] = False
                if known[-O:, :].all():
                    ys_ = seam(e[-O:, :].T[:, ::-1])
                    for x in range(P): use[P - ys_[x]:, x] = False
                use |= ~known
            # мягкий край шва в 2 px, чтобы не было ступеньки в цвете
            wgt = cv2.GaussianBlur(use.astype(np.float32), (0, 0), 1.0); wgt[~known] = 1
            out[np.ix_(ys, xs)] = cur * (1 - wgt[..., None]) + patch * wgt[..., None]
            done[np.ix_(ys, xs)] = True
    return out

def make(gid, out_dir, cfg):
    img = cv2.imread(os.path.join(HERE, 'tex', gid + '.jpg'), cv2.IMREAD_COLOR)[:, :, ::-1]
    a = lin(img)
    if cfg.get('flatten', 0.12): a = flatten(a, cfg.get('flatten', 0.12) * max(a.shape[:2]))
    a = a * cfg.get('gain', 1.0)
    if cfg.get('sat', 1.0) != 1.0:  # мелкое зерно на расстоянии сливается: чуть насыщеннее, чтобы цвет читался как на образце
        Y = a.mean(axis=2, keepdims=True); a = np.clip(Y + (a - Y) * cfg['sat'], 0, None)
    P = cfg.get('patch', 128); O = cfg.get('overlap', P // 4); n = cfg.get('tiles', 12)
    t = quilt(a, n, P, O, seed=cfg.get('seed', 1))
    os.makedirs(out_dir, exist_ok=True); os.makedirs(os.path.join(out_dir, 'sw'), exist_ok=True)
    cv2.imwrite(os.path.join(out_dir, gid + '.png'), (np.clip(t, 0, 1) * 65535 + 0.5).astype(np.uint16)[:, :, ::-1])
    s = cv2.resize(srgb(t[:min(t.shape[0], 512), :min(t.shape[1], 512)]), (96, 96), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(out_dir, 'sw', gid + '.jpg'), (s * 255 + 0.5).astype(np.uint8)[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 88])
    return t.shape[0]

if __name__ == '__main__':
    out = sys.argv[1]; want = sys.argv[2:]
    for g in json.load(open(os.path.join(HERE, 'granites.json'))):
        if want and g['id'] not in want: continue
        import time; t0 = time.time(); px = make(g['id'], out, g.get('tex', {}))
        print(g['id'], px, 'px', round(time.time() - t0, 1), 's', flush=True)
