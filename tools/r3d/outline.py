# Контур стелы по фото каталога (белый фон): маска → де-скос (горизонтальные) → верх тумбы → гладкий контур стелы.
# Пишет <ol>/<code>.json (контур, пропорции тумбы), <code>-tex.png (вырезка для рельефа/декора), <code>-dbg.png.
import cv2, numpy as np, json, os

def use_loose(code):
    # семейства с декором/драпировкой: контур по «мягкой» маске, чтобы не терять светлый мрамор
    return code[0] in 'DEFI' or code in ('C25',)

def mask_of(img, loose=False):
    a = img.astype(np.float32); mx = a.max(axis=2); mn = a.min(axis=2)
    m = (((mn < 249) | ((mx - mn) > 14)) if loose else ((mx < 236) | ((mx - mn) > 28))).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        k = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); m = (lab == k).astype(np.uint8)
    # замкнутые светлые области внутри — часть памятника; сквозным вырезом считаем только чисто-белую
    inv = (1 - m).astype(np.uint8); n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv, 4)
    border = set(np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]])))
    for i in range(1, n2):
        if i in border: continue
        reg = lab2 == i
        if st2[i, cv2.CC_STAT_AREA] > 400 and mn[reg].mean() > 246: continue
        m[reg] = 1
    return m

def mask_dark(img):
    # только тёмный камень: без светлой тени под тумбой (по ней «верх тумбы» находился у её низа — H/I)
    a = img.astype(np.float32); m = (a.max(axis=2) < 160).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1: m = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    return m

def rows(m):
    h = m.shape[0]; L = np.full(h, -1); R = np.full(h, -1)
    for y in range(h):
        xs = np.flatnonzero(m[y])
        if xs.size: L[y], R[y] = xs[0], xs[-1]
    return L, R

def bottom_slope(m):
    cols = np.flatnonzero(m.any(axis=0)); x0, x1 = cols[0], cols[-1]
    xs = np.arange(int(x0 + 0.15 * (x1 - x0)), int(x0 + 0.75 * (x1 - x0)))
    B = np.array([np.flatnonzero(m[:, x])[-1] for x in xs], np.float64)
    k, b = np.polyfit(xs, B, 1)
    return k, (x0 + x1) / 2

def deshear(img, m, k, xc):
    h, w = m.shape; pad = int(abs(k) * w) + 4
    M = np.float32([[1, 0, 0], [-k, 1, k * xc + pad]])
    m2 = cv2.warpAffine(m, M, (w, h + 2 * pad), flags=cv2.INTER_NEAREST, borderValue=0)
    i2 = cv2.warpAffine(img, M, (w, h + 2 * pad), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))
    return i2, m2

def ml_keep(ml, m):
    n, lab, st, _ = cv2.connectedComponentsWithStats(ml, 8)
    keep = np.zeros_like(ml)
    for i in np.unique(lab[(m > 0) & (ml > 0)]):
        if i: keep[lab == i] = 1
    return keep

def split(m):
    L, R = rows(m); ys = np.flatnonzero(L >= 0); y0, y1 = ys[0], ys[-1]; H = y1 - y0
    Lf = L.astype(np.float64)
    ref = np.arange(y1 - int(0.10 * H), y1 - int(0.04 * H))
    bw = np.median(R[ref] - L[ref])
    # верх тумбы: левый край быстро уходит влево (видна верхняя грань тумбы). Берём самый нижний такой участок:
    # выше могут быть «юбки» и драпировки самой стелы.
    cand = [y for y in range(y0 + int(0.45 * H), y1 - int(0.04 * H))
            if Lf[y] - Lf[y + 6] > 9 and Lf[y] - Lf[min(y1, y + 60)] > 0.03 * bw]
    if not cand: raise RuntimeError('tumba split failed')
    runs = [[cand[0], cand[0]]]
    for y in cand[1:]:
        if y - runs[-1][1] <= 8: runs[-1][1] = y
        else: runs.append([y, y])
    yt = runs[-1][0]
    rr = np.arange(yt + 1, min(y1 - int(0.04 * H), yt + int(0.12 * H)))
    return yt, (float(np.min(L[rr])), float(np.max(R[rr])), y1)

def smooth_contours(s, up=4, sig=1.3, eps=0.3):
    f = cv2.GaussianBlur(s.astype(np.float32), (0, 0), sig)
    f = cv2.resize(f, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
    b = (f > 0.5).astype(np.uint8)
    cs, hier = cv2.findContours(b, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    polys = []
    for i, c in enumerate(cs):
        if cv2.contourArea(c) < 60 * up * up: continue
        ap = cv2.approxPolyDP(c, eps * up, True)[:, 0, :].astype(np.float64)
        polys.append({'hole': bool(hier[0][i][3] >= 0), 'pts': ((ap + 0.5) / up - 0.5).tolist()})
    return polys

def outline(path, code, ol_dir, dbg=True):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None: raise RuntimeError('cannot read ' + path)
    m = mask_of(img[:, :, ::-1]); k = 0.0
    if code[0] in 'HI':
        k, xc = bottom_slope(mask_dark(img[:, :, ::-1]))
        img, m = deshear(img, m, k, xc)
    try:
        yt, (bl, br, yb) = split(mask_dark(img[:, :, ::-1]))
    except RuntimeError:
        yt, (bl, br, yb) = split(m)
    if use_loose(code):
        ml = mask_of(img[:, :, ::-1], loose=True)
        s = cv2.bitwise_and(ml, cv2.dilate(m, np.ones((9, 9), np.uint8)) | ml_keep(ml, m))
    else:
        s = m.copy()
    s[yt:, :] = 0
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(s, 8)
    if n_ > 1:
        s = (lab_ == 1 + np.argmax(st_[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    polys = smooth_contours(s)
    ys, xs = np.nonzero(s); x0, x1, y0 = xs.min(), xs.max() + 1, ys.min()
    W = float(x1 - x0); H = float(yt - y0)
    out = {'code': code, 'shear': float(k), 'w': W, 'h': H, 'aspect': H / W,
           'tumba': {'l': float(bl - x0) / W, 'r': float(br - x0) / W, 'h': float(yb - yt) / W},
           'polys': [{'hole': p['hole'], 'pts': [[(x - x0) / W, (yt - y) / W] for x, y in p['pts']]} for p in polys]}
    crop = img[y0:yt, x0:x1].copy(); cm = s[y0:yt, x0:x1]
    cv2.imwrite(os.path.join(ol_dir, code + '-tex.png'), np.dstack([crop, (cm * 255).astype(np.uint8)]))
    if dbg:
        v = img.copy()
        for p in polys:
            cv2.polylines(v, [np.round(np.array(p['pts'])).astype(np.int32)], True, (255, 0, 0) if p['hole'] else (0, 0, 255), 2)
        cv2.line(v, (0, yt), (v.shape[1], yt), (0, 200, 0), 2)
        cv2.line(v, (int(bl), yt + 4), (int(br), yt + 4), (0, 160, 255), 2)
        cv2.imwrite(os.path.join(ol_dir, code + '-dbg.jpg'), v, [cv2.IMWRITE_JPEG_QUALITY, 80])
    json.dump(out, open(os.path.join(ol_dir, code + '.json'), 'w'))
    return out
