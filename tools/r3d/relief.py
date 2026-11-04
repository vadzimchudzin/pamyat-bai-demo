# Рельеф (bump) и декор по вырезке стелы: high-pass яркости внутри маски; светлые области — декор (мрамор, гравировка)
import cv2, numpy as np, os

def maps(code, ol_dir):
    t = cv2.imread(os.path.join(ol_dir, code + '-tex.png'), cv2.IMREAD_UNCHANGED)
    bgr = t[:, :, :3].astype(np.float32) / 255; m = (t[:, :, 3] > 127).astype(np.float32)
    h, w = m.shape
    L = 0.114 * bgr[:, :, 0] + 0.587 * bgr[:, :, 1] + 0.299 * bgr[:, :, 2]
    er = cv2.erode(m, np.ones((5, 5), np.uint8))
    dec = ((L > 0.56) & (er > 0)).astype(np.float32)
    dec = cv2.morphologyEx(dec, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats((dec > 0).astype(np.uint8), 8)
    keep = np.zeros_like(dec)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 0.0015 * h * w: keep[lab == i] = 1
    dec = cv2.GaussianBlur(cv2.dilate(keep, np.ones((3, 3), np.uint8)), (0, 0), 1.0) * m
    sig = 0.05 * w
    low = cv2.GaussianBlur(L * m, (0, 0), sig) / (cv2.GaussianBlur(m, (0, 0), sig) + 1e-6)
    hp = (L - low) * m
    dist = cv2.distanceTransform((m > 0).astype(np.uint8), cv2.DIST_L2, 5)
    edge = np.clip((dist - 0.012 * w) / (0.02 * w), 0, 1)
    hpe = hp * edge * (1 - dec)
    dec_frac = float(dec.sum() / max(1, m.sum()))
    r = cv2.GaussianBlur(np.clip(0.5 + hpe / 0.25, 0, 1), (0, 0), 1.2)
    cv2.imwrite(os.path.join(ol_dir, code + '-relief.png'), (r * 65535).astype(np.uint16))
    dp = os.path.join(ol_dir, code + '-decor.png')
    if dec_frac > 0.02:
        cv2.imwrite(dp, np.dstack([(bgr * 255).astype(np.uint8), (dec * 255).astype(np.uint8)]))
    elif os.path.exists(dp):
        os.remove(dp)
    return dec_frac
