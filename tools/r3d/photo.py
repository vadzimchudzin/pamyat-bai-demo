# Блеск и резьба с исходного фото для лицевой грани стелы (build.py → AOV pg/fw/cv, post.py):
# <code>-photo.png — фото без боковой и верхней граней (они видны на исходном снимке справа и сверху), цвета у края
# «протянуты» наружу, чтобы при выборке не попадал белый фон; альфа — маска лицевой грани.
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

def photo_maps(code, ol_dir, vertical=True):
    t = cv2.imread(os.path.join(ol_dir, code + '-tex.png'), cv2.IMREAD_UNCHANGED)
    bgr = t[:, :, :3]; h, w = bgr.shape[:2]
    L = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    # только тёмный камень: светлый ореол по краю «мягкой» маски и белый фон в блеск не попадают
    m = ((t[:, :, 3] > 127) & (bgr.max(axis=2) < 170)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab0, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1: m = (lab0 == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    dx = np.clip(_strip(L, m, 1), 0.006 * w, 0.06 * w); dy = np.clip(_strip(L, m, 0), 0.004 * w, 0.04 * w)
    # лицевая грань = силуэт, сдвинутый на ширину боковых граней (вправо-вверх видны бок и верх стелы)
    M = np.float32([[1, 0, -dx], [0, 1, dy]])
    sh = cv2.warpAffine(m, M, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)
    F = (m & sh).astype(np.uint8)
    F = cv2.erode(F, np.ones((3, 3), np.uint8), iterations=2)
    a = cv2.GaussianBlur(F.astype(np.float32), (0, 0), 1.2) * F
    # протянуть цвета лицевой грани наружу (ближайший пиксель грани)
    _, lab = cv2.distanceTransformWithLabels(1 - F, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(F == 0)
    zy, zx = np.nonzero(F)
    if zy.size:
        idx = np.zeros(lab.max() + 1, np.int64)
        lab_f = lab[zy, zx]; idx[lab_f] = np.arange(zy.size)
        src = idx[lab[ys, xs]]
        bled = bgr.copy(); bled[ys, xs] = bgr[zy[src], zx[src]]
    else:
        bled = bgr
    cv2.imwrite(os.path.join(ol_dir, code + '-photo.png'), np.dstack([bled, (a * 255 + 0.5).astype(np.uint8)]))
    # затенение углублений: яркость (линейная) относительно соседства, только затемнение
    lin = (bled.astype(np.float32) / 255) ** 2.2; Y = lin @ np.float32([0.114, 0.587, 0.299])
    Y = cv2.GaussianBlur(Y, (0, 0), 1.0); Ff = F.astype(np.float32)
    sig = 0.03 * w
    lev = cv2.GaussianBlur(Y * Ff, (0, 0), sig) / (cv2.GaussianBlur(Ff, (0, 0), sig) + 1e-6)
    r = np.clip(Y / np.maximum(lev, 1e-4), 0, 1)
    cav = 1 - 0.65 * (1 - r) * Ff
    cv2.imwrite(os.path.join(ol_dir, code + '-cav.png'), (np.clip(cav, 0, 1) * 65535 + 0.5).astype(np.uint16))
    return {'dx': round(dx / w, 4), 'dy': round(dy / w, 4)}
