# Блеск и резьба с исходного фото для лицевой грани стелы (build.py → AOV pg/fw/cv, post.py):
# <code>-photo.png — фото лицевой грани (без боковой и верхней граней — на исходном снимке они видны справа и сверху);
# альфа — маска лицевой грани. Цвета берутся только с тёмного камня в глубине грани: у самого края на фото — блики фасок
# и тёмные полосы торцов, раньше они попадали на грань рваными пятнами. Полоса у края, светлая резьба и блики
# заполняются гладко (push-pull + релаксация) по соседству — без «лучей» от ближайшего пикселя.
# <code>-cav.png — затенение углублений резьбы (тёмные места фото относительно соседства), 1 = без затенения.
import cv2, numpy as np, os

def _strip(L, m, axis, frac_lo=0.3, frac_hi=0.7):
    # ширина тёмной полосы у правого (axis=1) или верхнего (axis=0) края маски: медиана по средним строкам/столбцам.
    # Уровень лицевой грани — рядом с краем (у полированной грани заметный градиент отражения), 2 px сглаживания края пропускаем
    h, w = m.shape; out = []; lim = int(0.07 * w)
    lines = range(int(h * frac_lo), int(h * frac_hi), 3) if axis == 1 else range(int(w * frac_lo), int(w * frac_hi), 3)
    for i in lines:
        idx = np.flatnonzero(m[i] if axis == 1 else m[:, i])
        if idx.size < 3 * lim: continue
        seq = (L[i, idx[0]:idx[-1] + 1][::-1] if axis == 1 else L[idx[0]:idx[-1] + 1, i])  # от края внутрь
        ref = np.median(seq[lim:2 * lim])
        dark = seq[:lim] < 0.6 * ref
        k0 = int(np.argmax(dark[:6])) if dark[:6].any() else -1  # пропускаем сглаженный край (2–4 px)
        if k0 < 0: out.append(0); continue
        k = k0
        while k < lim and dark[k]: k += 1
        if k < lim: out.append(k)
    return float(np.median(out)) if len(out) >= 5 else 0.0

def fill(img, valid, iters=150):
    # гладкое заполнение пикселей вне valid: пирамида push-pull, затем релаксация Лапласа (края valid фиксированы)
    def pp(c, w):
        if min(c.shape[:2]) < 8:
            mval = (c * w[..., None]).sum((0, 1)) / max(float(w.sum()), 1e-6)
            return np.broadcast_to(mval, c.shape).astype(np.float32).copy()
        cd = cv2.pyrDown(c * w[..., None]); wd = cv2.pyrDown(w)
        f = pp(cd / np.maximum(wd, 1e-6)[..., None], np.clip(wd * 4, 0, 1))
        up = cv2.pyrUp(f, dstsize=(c.shape[1], c.shape[0]))
        return c * w[..., None] + up * (1 - w[..., None])
    v = valid.astype(np.float32)
    F = pp(img.astype(np.float32), v)
    hole = valid == 0
    if hole.any():
        ys, xs = np.nonzero(hole)
        y0, y1, x0, x1 = max(0, ys.min() - 1), min(F.shape[0], ys.max() + 2), max(0, xs.min() - 1), min(F.shape[1], xs.max() + 2)
        sub = F[y0:y1, x0:x1]; hm = hole[y0:y1, x0:x1]
        for _ in range(iters):
            P = np.pad(sub, ((1, 1), (1, 1), (0, 0)), mode='edge')
            avg = (P[:-2, 1:-1] + P[2:, 1:-1] + P[1:-1, :-2] + P[1:-1, 2:]) * 0.25
            sub[hm] = avg[hm]
    return F

def photo_maps(code, ol_dir, vertical=True):
    t = cv2.imread(os.path.join(ol_dir, code + '-tex.png'), cv2.IMREAD_UNCHANGED)
    bgr = t[:, :, :3]; h, w = bgr.shape[:2]
    L = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    sil = (t[:, :, 3] > 127).astype(np.uint8)
    # тёмный камень: по нему меряем торцы; светлый ореол по краю «мягкой» маски и белый фон в блеск не попадают
    dk = cv2.morphologyEx((sil & (bgr.max(axis=2) < 170)).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = dk.copy()
    n, lab0, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1: m = (lab0 == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    dx = np.clip(_strip(L, m, 1), 0.006 * w, 0.06 * w); dy = np.clip(_strip(L, m, 0), 0.004 * w, 0.04 * w)
    # лицевая грань = силуэт (вместе со светлой резьбой), сдвинутый на ширину боковых граней (вправо-вверх видны бок и верх)
    M = np.float32([[1, 0, -dx], [0, 1, dy]])
    sh = cv2.warpAffine(sil, M, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)
    F = cv2.erode((sil & sh).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2)
    a = cv2.GaussianBlur(F.astype(np.float32), (0, 0), 1.2) * F
    # источник цвета: тёмный камень грани не ближе eb к краю
    dF = cv2.distanceTransform(F, cv2.DIST_L2, 5)
    eb = max(3.0, 0.012 * w)
    # (весь тёмный камень, не только самый крупный кусок: тёмный крест внутри светлой драпировки — тоже камень)
    C = (F & dk & (dF > eb).astype(np.uint8)).astype(np.uint8)
    if C.sum() < 0.05 * max(1, F.sum()): C = (F & dk).astype(np.uint8)
    bled = np.clip(fill(bgr, C) + 0.5, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(ol_dir, code + '-photo.png'), np.dstack([bled, (a * 255 + 0.5).astype(np.uint8)]))
    # затенение углублений: яркость (линейная) относительно соседства, только затемнение
    lin = (bled.astype(np.float32) / 255) ** 2.2; Y = lin @ np.float32([0.114, 0.587, 0.299])
    Y = cv2.GaussianBlur(Y, (0, 0), 1.0); Ff = F.astype(np.float32)
    sig = 0.03 * w
    lev = cv2.GaussianBlur(Y * Ff, (0, 0), sig) / (cv2.GaussianBlur(Ff, (0, 0), sig) + 1e-6)
    r = np.clip(Y / np.maximum(lev, 1e-4), 0, 1)
    cav = 1 - 0.65 * (1 - r) * Ff
    cv2.imwrite(os.path.join(ol_dir, code + '-cav.png'), (np.clip(cav, 0, 1) * 65535 + 0.5).astype(np.uint16))
    return {'dx': round(float(dx) / w, 4), 'dy': round(float(dy) / w, 4)}
