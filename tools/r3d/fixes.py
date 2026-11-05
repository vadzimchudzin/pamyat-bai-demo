# Правки исходных фото перед 3D (проверка: python3 fixes.py <src.webp> <код> <out.png>).
# В каталоге 2024 (96 dpi) мелкий светлый декор занимает 10–40 px; после апскейла он превращается в кашу,
# и в рендере это видно сильнее всего. Там, где декор нечитаем, он перерисовывается чётко по месту исходного:
#   F18 — православный крест в левом верхнем углу (выступает над стелой).
# Координаты — по исходнику assets/catalog/md/<код>.webp @ SRC_SHA (1001 × 1600, масштаб по высоте).
import os, sys, cv2, numpy as np

SS = 4  # суперсэмплинг для гладких краёв


def _aa_fill(shape, polys, ss=SS):
    # маска (0..1) многоугольников с антиалиасингом
    h, w = shape
    m = np.zeros((h * ss, w * ss), np.uint8)
    for p in polys:
        cv2.fillPoly(m, [np.round(np.asarray(p, np.float64) * ss).astype(np.int32)], 255, cv2.LINE_AA)
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def _rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def _bar(cx, cy, length, thick, ang_deg):
    a = np.deg2rad(ang_deg); ux, uy = np.cos(a), np.sin(a); vx, vy = -uy, ux
    hl, ht = length / 2, thick / 2
    return [(cx - ux * hl - vx * ht, cy - uy * hl - vy * ht), (cx + ux * hl - vx * ht, cy + uy * hl - vy * ht),
            (cx + ux * hl + vx * ht, cy + uy * hl + vy * ht), (cx - ux * hl + vx * ht, cy - uy * hl + vy * ht)]


def _f18(img):
    h, w = img.shape[:2]; s = h / 1600.0
    out = img.copy().astype(np.float32)
    X = lambda v: v * s  # координаты — по исходнику 1001×1600 (масштаб по высоте)
    left, top = X(217), X(149)          # левый край и верх стелы у креста
    # 1) убрать кашу: в зоне креста — фон над/левее стелы, грань стелы — копией той же строки правее (сохраняет
    #    вертикальный градиент и верхнюю кромку), разница яркости по краю зоны сглажена (мембрана)
    x0, x1, y0, y1 = int(X(196)), int(X(450)), int(X(96)), int(X(440))
    sh = int(X(200))
    yy0, xx0 = np.mgrid[0:h, 0:w]
    zone = (xx0 >= x0) & (xx0 < x1) & (yy0 >= y0) & (yy0 < y1)
    bgz = zone & ((yy0 < top) | (xx0 < left))
    face = zone & ~bgz
    S = np.empty_like(out); S[:, :w - sh] = img[:, sh:]; S[:, w - sh:] = img[:, -1:]
    ring = cv2.dilate(zone.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~zone & (yy0 >= top) & (xx0 >= left + X(24))
    d = np.zeros_like(out); d[ring] = img[ring].astype(np.float32) - S[ring]
    # мембрана: разница по кольцу продолжается внутрь зоны гармонически (релаксация Якоби на вырезке)
    ys0, ys1, xs0, xs1 = y0 - 4, y1 + 4, x0 - 4, x1 + 4
    Dc = d[ys0:ys1, xs0:xs1].copy(); Kc = ring[ys0:ys1, xs0:xs1]
    Uc = face[ys0:ys1, xs0:xs1] | (zone[ys0:ys1, xs0:xs1] & ~Kc)
    if Kc.any():
        Dc[~Kc] = d[ring].mean(axis=0)
        for _ in range(1500):
            P = np.pad(Dc, ((1, 1), (1, 1), (0, 0)), mode='edge')
            avg = (P[:-2, 1:-1] + P[2:, 1:-1] + P[1:-1, :-2] + P[1:-1, 2:]) * 0.25
            Dc[Uc] = avg[Uc]
    D = np.zeros_like(out); D[ys0:ys1, xs0:xs1] = Dc
    out[face] = S[face] + D[face]
    out[bgz] = 255
    # левый край стелы (тёмная фаска) — профиль строк ниже креста
    #    (только сама фаска; яркость — по строке грани, чтобы не было ступеньки)
    ra, rb = int(X(445)), int(X(475)); ca, cb = int(left) - 2, int(left + X(11)); fr = slice(int(left + X(30)), int(left + X(60)))
    prof = img[ra:rb, ca:cb].astype(np.float32).mean(axis=0); ref = img[ra:rb, fr].astype(np.float32).mean()
    for y in range(int(top), y1):
        k = out[y, fr].mean() / max(ref, 1.0)
        out[y, ca:cb] = prof * k
    # 2) крест: стойка, титло, перекладина, косая нижняя (левый конец выше).
    #    Светлое поле креста ≤ ~22 px в ширину: relief.decor_mask берёт тонкие светлые элементы как резьбу
    #    (светлый матовый камень в рендере), а не как блик полировки.
    cx, t = X(288), X(26)
    parts = [
        _rect(cx - t / 2, X(108), cx + t / 2, X(418)),           # стойка
        _rect(cx - X(38), X(126), cx + X(38), X(144)),           # титло
        _rect(cx - X(72), X(174), cx + X(72), X(200)),           # перекладина
        _bar(cx, X(345), X(96), X(20), 20),                      # подножие: левый конец выше
    ]
    A = _aa_fill((h, w), parts)
    # тёмная кромка (фаска в тени) и тонкий гравированный контур внутри
    k = max(1, int(round(X(2.0))))
    er = cv2.erode((A > 0.5).astype(np.uint8), np.ones((2 * k + 1, 2 * k + 1), np.uint8))
    ins = max(2, int(round(X(5))))
    er2 = cv2.erode((A > 0.5).astype(np.uint8), np.ones((2 * ins + 1, 2 * ins + 1), np.uint8))
    er3 = cv2.erode(er2, np.ones((3, 3), np.uint8))
    rim = np.clip(A - cv2.GaussianBlur(er.astype(np.float32), (0, 0), 0.7), 0, 1)
    groove = cv2.GaussianBlur(np.clip(er2.astype(np.float32) - er3.astype(np.float32), 0, 1), (0, 0), 0.6)
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    base = np.broadcast_to(232 - 16 * np.clip((yy * h - X(108)) / X(310), 0, 1), (h, w))  # светлый камень, книзу чуть темнее
    stone = np.dstack([base - 5, base - 2, base]).astype(np.float32)
    rng = np.random.default_rng(18)
    stone += rng.normal(0, 2.5, stone.shape).astype(np.float32)   # зерно мрамора
    stone -= (groove * 32)[:, :, None]                            # контур остаётся светлее порога декора
    stone -= (rim * 150)[:, :, None]
    a3 = A[:, :, None]
    out = out * (1 - a3) + stone * a3
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


FIX = {'F18': _f18}


def patched(path, code, work):
    # путь к исходнику с правкой (или исходный путь, если правки нет)
    if code not in FIX: return path
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None: return path
    os.makedirs(work, exist_ok=True)
    p = os.path.join(work, code + '.png')
    cv2.imwrite(p, FIX[code](img))
    return p


if __name__ == '__main__':
    src, code, dst = sys.argv[1:4]
    cv2.imwrite(dst, FIX[code](cv2.imread(src, cv2.IMREAD_COLOR)))
