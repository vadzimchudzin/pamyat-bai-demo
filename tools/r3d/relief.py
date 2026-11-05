# Рельеф (bump) и декор по вырезке стелы: high-pass яркости внутри маски; светлые области — декор (мрамор, гравировка, резьба)
import cv2, numpy as np, os

def _run_right(m):
    # расстояние (px) до ближайшего фона справа в той же строке
    h, w = m.shape
    idx = np.where(m == 0, np.arange(w)[None, :], w + 10 ** 6)
    return np.minimum.accumulate(idx[:, ::-1], axis=1)[:, ::-1] - np.arange(w)[None, :]

def _run_up(m):
    # расстояние (px) до ближайшего фона сверху в том же столбце
    h, w = m.shape
    idx = np.where(m == 0, np.arange(h)[:, None], -10 ** 6)
    return np.arange(h)[:, None] - np.maximum.accumulate(idx, axis=0)

def decor_mask(bgr, m, F=None):
    # светлая резьба/гравировка/мрамор внутри силуэта (только у семейств с резьбой, см. mkspec.relief_family).
    # A — крупные светлые области (драпировки, мрамор) — как раньше: площадь > 0.15 % кадра и в сумме > 2 % стелы;
    #     кроме толстых светлых полос вдоль края лицевой грани — это видимые торцы выступающего креста (C25), а не резьба.
    # B — мелкие элементы (листья, контуры крестов): раньше их отбрасывал порог площади, и они рендерились тёмным гранитом
    #     («чёрные кляксы»). Берём только тонкие/компактные элементы вдали от края: блики фасок, торцы и блик изгиба
    #     волнистой стелы лежат у края лицевой грани или толстые — их не берём.
    h, w = m.shape
    L = 0.114 * bgr[:, :, 0] + 0.587 * bgr[:, :, 1] + 0.299 * bgr[:, :, 2]
    mu = (m > 0).astype(np.uint8)
    Fm = mu if F is None else (F > 0).astype(np.uint8)
    er = cv2.erode(mu, np.ones((5, 5), np.uint8))
    dec = ((L > 0.56) & (er > 0)).astype(np.uint8)
    dec = cv2.morphologyEx(dec, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(dec, 8)
    area = st[:, cv2.CC_STAT_AREA].astype(np.float64)
    S = float(mu.sum())
    own = cv2.distanceTransform(dec, cv2.DIST_L2, 5)
    thick = np.zeros(n); np.maximum.at(thick, lab.ravel(), own.ravel()); thick /= w
    dF = cv2.distanceTransform(Fm, cv2.DIST_L2, 5)
    bandF = np.bincount(lab[dF < 0.035 * w], minlength=n) / np.maximum(area, 1)
    side = ((_run_right(mu) <= 0.06 * w) | (_run_up(mu) <= 0.04 * w))
    sidef = np.bincount(lab[side], minlength=n) / np.maximum(area, 1)
    big = [i for i in range(1, n) if area[i] > 0.0015 * h * w]
    use_big = sum(area[i] for i in big) / max(S, 1) > 0.02
    keep = np.zeros(n, np.float32)
    for i in range(1, n):
        if area[i] < 0.00012 * S: continue
        if use_big and i in big and not (bandF[i] > 0.6 and thick[i] > 0.045):
            keep[i] = 1
        elif bandF[i] < 0.4 and sidef[i] < 0.3 and thick[i] < 0.03:
            keep[i] = 1
    if not use_big and (keep * area).sum() < 0.005 * S:
        keep[:] = 0  # пара случайных бликов в складках резьбы — не декор
    k = keep[lab]
    return cv2.GaussianBlur(cv2.dilate(k, np.ones((3, 3), np.uint8)), (0, 0), 1.0) * (m > 0)

def maps(code, ol_dir, relief=True):
    t = cv2.imread(os.path.join(ol_dir, code + '-tex.png'), cv2.IMREAD_UNCHANGED)
    bgr = t[:, :, :3].astype(np.float32) / 255; m = (t[:, :, 3] > 127).astype(np.float32)
    h, w = m.shape
    L = 0.114 * bgr[:, :, 0] + 0.587 * bgr[:, :, 1] + 0.299 * bgr[:, :, 2]
    pp = os.path.join(ol_dir, code + '-photo.png')
    F = (cv2.imread(pp, cv2.IMREAD_UNCHANGED)[:, :, 3] > 127) if os.path.exists(pp) else None
    dec = decor_mask(bgr, m, F) if relief else np.zeros_like(m)
    dec_frac = float(dec.sum() / max(1, m.sum()))
    rp = os.path.join(ol_dir, code + '-relief.png')
    if relief:
        sig = 0.05 * w
        low = cv2.GaussianBlur(L * m, (0, 0), sig) / (cv2.GaussianBlur(m, (0, 0), sig) + 1e-6)
        hp = (L - low) * m
        dist = cv2.distanceTransform((m > 0).astype(np.uint8), cv2.DIST_L2, 5)
        edge = np.clip((dist - 0.012 * w) / (0.02 * w), 0, 1)
        hpe = hp * edge * (1 - dec)
        r = cv2.GaussianBlur(np.clip(0.5 + hpe / 0.25, 0, 1), (0, 0), 1.2)
        cv2.imwrite(rp, (r * 65535).astype(np.uint16))
    elif os.path.exists(rp):
        os.remove(rp)
    dp = os.path.join(ol_dir, code + '-decor.png')
    if dec_frac > 0.002:
        cv2.imwrite(dp, np.dstack([(bgr * 255).astype(np.uint8), (dec * 255).astype(np.uint8)]))
    elif os.path.exists(dp):
        os.remove(dp)
    return dec_frac
