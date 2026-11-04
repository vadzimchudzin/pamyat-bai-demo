#!/usr/bin/env python3
# ПАМЯТЬ.БАЙ — «студийная» обработка фото каталога.
# Вырезает изделие (ISNet + уточнение края по цвету фона), убирает старый фон и тени,
# чистит «акварельные» разводы апскейла на камне, нейтрализует цвет габбро-диабаза,
# ставит изделие в единый кадр раздела на ровный белый фон с мягкой контактной тенью,
# усиливает грани и добавляет тонкую фактуру гранита. Форма и детали изделия не меняются.
import os, sys, json, math, time
import numpy as np, cv2
from PIL import Image

cv2.setNumThreads(max(1, os.cpu_count() or 1))

# кадр раздела: (ширина, высота) полного размера, поля и линия пола (доли кадра)
FRAMES = {
    'portrait': dict(W=2880, H=3840, mw=0.70, mh=0.83, floor=0.915),
    'landscape': dict(W=3840, H=3072, mw=0.78, mh=0.78, floor=0.90),
    'square': dict(W=3840, H=3840, mw=0.80, mh=0.80, floor=0.905),
    'wide': dict(W=3840, H=2560, mw=0.86, mh=0.74, floor=0.885),
    'cover': dict(W=3840, H=2880, mw=0.82, mh=0.80, floor=0.905),
}
CAT_FRAME = {'A': 'portrait', 'B': 'portrait', 'C': 'portrait', 'D': 'portrait', 'E': 'portrait', 'F': 'portrait', 'P': 'portrait',
             'H': 'landscape', 'I': 'landscape', 'K': 'square', 'O': 'wide'}
FLOOR_CATS = set('ABCDEFHIP')  # срез тумбы снизу — это линия пола, а не обрезка кадра

COVER_KIND = {'cover-vertical': 'A', 'cover-horizontal': 'H', 'cover-cross': 'P', 'cover-complex': 'K', 'cover-fence': 'O', 'cover-accessories': 'L'}

def kind(code):
    """буква раздела: A–F вертикальные, H/I горизонтальные, P кресты, K комплексы, O ограды, прочее — аксессуары"""
    return COVER_KIND.get(code, code[:1].upper())

def frame_for(code):
    return CAT_FRAME.get(kind(code), 'square')

def box(x, r):
    return cv2.blur(x, (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REFLECT)

def gauss(x, s):
    return cv2.GaussianBlur(x, (0, 0), s, borderType=cv2.BORDER_REFLECT)

def guided(I, p, r, eps):
    mI, mp = box(I, r), box(p, r)
    cov = box(I * p, r) - mI * mp
    var = box(I * I, r) - mI * mI
    a = cov / (var + eps); b = mp - a * mI
    return box(a, r) * I + box(b, r)

def nconv(img, w, sigma, k):
    """нормированная свёртка: гладкая оценка цвета по пикселям с весом w (на уменьшенной копии)"""
    h, ww = w.shape
    sh, sw = max(8, h // k), max(8, ww // k)
    iw = cv2.resize(img * w[..., None], (sw, sh), interpolation=cv2.INTER_AREA)
    wd = cv2.resize(w, (sw, sh), interpolation=cv2.INTER_AREA)
    s = max(0.8, sigma / k)
    iw1 = gauss(iw, s); wd1 = gauss(wd, s)
    est = iw1 / np.maximum(wd1[..., None], 1e-4)
    if (wd1 < 1e-3).any():  # где весов нет совсем — оценка грубее
        iw2 = gauss(iw, s * 6); wd2 = gauss(wd, s * 6)
        est2 = iw2 / np.maximum(wd2[..., None], 1e-6)
        t = np.clip(wd1 / 1e-3, 0, 1)[..., None]
        est = est * t + est2 * (1 - t)
    return cv2.resize(est, (ww, h), interpolation=cv2.INTER_LINEAR)

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

_SESS = None
def isnet(rgb, model):
    global _SESS
    import onnxruntime as ort
    if _SESS is None:
        so = ort.SessionOptions(); so.intra_op_num_threads = max(1, os.cpu_count() or 1)
        _SESS = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])
    h, w = rgb.shape[:2]
    x = cv2.resize(rgb, (1024, 1024), interpolation=cv2.INTER_AREA).astype(np.float32)
    x = x / max(float(x.max()), 1e-6) - 0.5
    x = x.transpose(2, 0, 1)[None].copy()
    out = _SESS.run(None, {_SESS.get_inputs()[0].name: x})[0][0, 0]
    mi, ma = float(out.min()), float(out.max())
    out = (out - mi) / max(ma - mi, 1e-6)
    return cv2.resize(out.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)

def disk(r):
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))

def clean_components(core):
    n, lab, st, _ = cv2.connectedComponentsWithStats(core.astype(np.uint8), connectivity=8)
    if n <= 2: return core
    areas = st[1:, cv2.CC_STAT_AREA]; main = 1 + int(np.argmax(areas)); A = areas.max()
    x0, y0, w0, h0 = st[main, :4]; x1, y1 = x0 + w0, y0 + h0
    keep = np.zeros(n, bool); keep[main] = True
    for i in range(1, n):
        if i == main: continue
        x, y, w, h, a = st[i]
        if a < A * 0.0004: continue                      # пылинки
        if y >= y1 - 2 or x >= x1 - 2 or x + w <= x0 + 2 or y + h <= y0 + 2:
            if a < A * 0.08: continue                    # подписи и мусор вне изделия (например, «P8» под тумбой)
        keep[i] = True
    return keep[lab]

def fill_holes(core, a0):
    """закрытые «дыры» внутри изделия: блики и стекло — заливаем, просветы (ограды) — оставляем фоном"""
    inv = (~core).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    if n <= 1: return core
    h, w = core.shape
    A = max(1, int(core.sum()))
    out = core.copy()
    edge = np.zeros(n, bool)
    edge[np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))] = True
    for i in range(1, n):
        if edge[i]: continue
        x, y, ww, hh, ar = st[i]
        reg = lab[y:y + hh, x:x + ww] == i
        if ar < A * 0.003 or float(a0[y:y + hh, x:x + ww][reg].mean()) > 0.45:
            out[y:y + hh, x:x + ww][reg] = True
    return out

def border_bg(D, tol):
    """фон = почти белые пиксели, связанные с краем кадра (внутренние светлые плиты и мрамор остаются изделием)"""
    nw = (D < tol).astype(np.uint8)
    n, lab = cv2.connectedComponents(nw, connectivity=4)
    ids = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    ids = ids[ids > 0]
    return np.isin(lab, ids)

def light_parts(core, C, D, S):
    """светлые детали изделия — белый мрамор, драпировки, светлые грани и фаски: всё, что отделено
    от белого фона хоть каким-то краем (заливка от рамки кадра) и прилегает к изделию.
    Не добавляем: просветы цвета фона (внутри оград, между столбиками), старые тени и дымку
    на полу (под ними в том же столбце нет изделия) и всё ниже основания."""
    h, w = core.shape
    ffc = ~border_bg(D, 0.035)
    ffc = cv2.morphologyEx(ffc.astype(np.uint8), cv2.MORPH_OPEN, disk(2 * S + 1)).astype(bool)
    rows = np.where(core.any(1))[0]
    if not len(rows): return np.zeros_like(core)
    ffc[rows.max() + 1:] = False
    extra = ffc & ~core
    n, lab, st, _ = cv2.connectedComponentsWithStats(extra.astype(np.uint8), connectivity=8)
    out = np.zeros_like(core)
    if n <= 1: return out
    ring = np.concatenate([C[0], C[-1], C[:, 0], C[:, -1]])
    bgc = np.median(ring, axis=0).astype(np.float32)
    near = cv2.dilate(core.astype(np.uint8), disk(3 * S + 2)).astype(bool)
    under = np.flipud(np.maximum.accumulate(np.flipud(core.astype(np.uint8)), axis=0)).astype(bool)
    thick = cv2.erode(extra.astype(np.uint8), disk(2 * S + 1)).astype(bool)
    A = max(1, int(core.sum()))
    for i in np.unique(lab[near & extra]):
        if i <= 0 or st[i, cv2.CC_STAT_AREA] < A * 0.0005: continue
        x, y, ww, hh = st[i, :4]
        m = lab[y:y + hh, x:x + ww] == i
        if float(thick[y:y + hh, x:x + ww][m].mean()) < 0.25: continue  # тонкий ореол по краю камня, а не деталь
        dg = np.abs(C[y:y + hh, x:x + ww][m] - bgc).max(1)
        if float(dg.mean()) < 0.06: continue                      # просвет цвета фона
        if float(np.percentile(D[y:y + hh, x:x + ww][m], 90)) < 0.08:
            # мягкая тень у основания: ни края, ни рисунка; светлые вставки, окружённые камнем, оставляем
            y0, y1, x0, x1 = max(0, y - 1), min(h, y + hh + 1), max(0, x - 1), min(w, x + ww + 1)
            mm = lab[y0:y1, x0:x1] == i
            rg = cv2.dilate(mm.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~mm
            if float((~core[y0:y1, x0:x1][rg]).mean()) > 0.05: continue
        if float(under[y:y + hh, x:x + ww][m].mean()) < 0.6: continue  # тень или дымка на полу
        out[y:y + hh, x:x + ww] |= m
    return out

def matte(rgb, model, alpha_in=None, mode='hybrid'):
    """→ (fg RGB float 0..1 без примеси фона, alpha float 0..1)"""
    C = rgb.astype(np.float32) / 255.0
    h, w = C.shape[:2]; S = max(h, w) / 3840.0
    if alpha_in is not None:
        a = alpha_in.astype(np.float32) / 255.0
        core = clean_components(a > 0.5)
        a = a * cv2.dilate(core.astype(np.uint8), disk(3 * S + 1)).astype(np.float32)
        B = np.ones_like(C)
        fg = np.clip((C - (1 - a[..., None]) * B) / np.maximum(a[..., None], 0.04), 0, 1)
        return fg, a
    a0 = isnet(rgb, model)
    Y = C[..., 0] * 0.2126 + C[..., 1] * 0.7152 + C[..., 2] * 0.0722
    chroma = C.max(2) - C.min(2)
    # фон: светлые пиксели, где ISNet уверен, что изделия нет
    guess = (a0 > 0.5) | (Y < 0.6)
    near0 = cv2.dilate(guess.astype(np.uint8), disk(14 * S + 2)).astype(bool)
    wb = ((a0 < 0.1) & ~near0).astype(np.float32)
    if wb.sum() < 100: wb = (Y > 0.9).astype(np.float32)
    B = nconv(C, wb, 90 * S, 8)
    BY = B[..., 0] * 0.2126 + B[..., 1] * 0.7152 + B[..., 2] * 0.0722
    D = np.abs(C - B).max(2)
    if mode == 'ff':
        # комплексы: светлые плиты и щебень похожи на фон — снимаем только белый фон, связанный с краем кадра
        core = ~border_bg(D, 0.035)
        core = cv2.morphologyEx(core.astype(np.uint8), cv2.MORPH_OPEN, disk(2 * S + 1)).astype(bool)
        core = clean_components(core)
    else:
        dark = (BY - Y) > 0.30                           # камень заметно темнее фона
        vdark = (BY - Y) > 0.45                          # так темно тень на белом не бывает — это всегда камень
        colorful = (chroma > 0.10) & (D > 0.08)          # красный гранит, трава, бронза
        core = ((dark | colorful) & (a0 > 0.06)) | vdark | (a0 > 0.5)
        core = cv2.morphologyEx(core.astype(np.uint8), cv2.MORPH_OPEN, disk(2 * S + 1)).astype(bool)
        core = clean_components(core)
        core = fill_holes(core, a0)
        core = core | light_parts(core, C, D, S)
    coreu = core.astype(np.uint8)
    rb = max(2, int(round(8 * S)))
    inner = cv2.erode(coreu, disk(rb * 0.8)).astype(np.float32)
    F = nconv(C, inner, 22 * S, 4)
    dil = cv2.dilate(coreu, disk(rb)).astype(bool)
    ero = cv2.erode(coreu, disk(rb)).astype(bool)
    band = dil & ~ero
    Dv = F - B; dd = (Dv * Dv).sum(2)
    afb = np.clip(((C - B) * Dv).sum(2) / np.maximum(dd, 1e-4), 0, 1)
    rel = np.clip((np.sqrt(dd) * 255 - 28) / 50, 0, 1)
    gray = cv2.cvtColor(C, cv2.COLOR_RGB2GRAY)
    agf = np.clip(guided(gray, core.astype(np.float32), max(2, int(round(3 * S))), 2e-3), 0, 1)
    a = np.where(ero, 1.0, 0.0).astype(np.float32)
    ab = rel * afb + (1 - rel) * agf
    a[band] = ab[band]
    a[~dil] = 0
    a = np.where(a < 0.035, 0, a)  # остатки старых теней и полупрозрачная дымка
    a = smooth(0.1, 0.9, a).astype(np.float32)  # чёткий силуэт: переход края уже, чем у размытого апскейла
    fg = np.clip((C - (1 - a[..., None]) * B) / np.maximum(a[..., None], 0.04), 0, 1)
    return fg, a

def stone_weight(fg, a):
    mx = fg.max(2); mn = fg.min(2)
    Y = fg[..., 0] * 0.2126 + fg[..., 1] * 0.7152 + fg[..., 2] * 0.0722
    dark = 1 - smooth(0.42, 0.66, Y)
    low = 1 - smooth(0.07, 0.16, mx - mn)
    return a * dark * low, Y

def enhance_stone(fg, a, strength=1.0, S=1.0):
    ws, Y = stone_weight(fg, a)
    r = max(2, int(round(14 * S)))
    Yg = guided(Y, Y, r, (0.03) ** 2)                  # разводы апскейла → ровная полировка
    Yc = Y + ws * 0.9 * strength * (Yg - Y)
    chroma = fg - Y[..., None]                          # нейтральный чёрный вместо коричневого
    out = Yc[..., None] + chroma * (1 - 0.72 * ws[..., None])
    Yn = out[..., 0] * 0.2126 + out[..., 1] * 0.7152 + out[..., 2] * 0.0722
    Yt = np.power(np.clip(Yn, 0, 1), 1.08)              # чуть глубже чёрный
    out = out + (ws * (Yt - Yn))[..., None]
    return np.clip(out, 0, 1)

def cut_sides(m, x0, x1, y0, y1, n=2, thr=0.06):
    """край кадра режет изделие, только если по краю идёт длинный срез (≥ thr размера изделия);
    кончик угла или гравировки, коснувшийся края при старой обрезке, — не срез"""
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    run = dict(l=m[:, :n].any(1).sum() / bh, r=m[:, -n:].any(1).sum() / bh,
               t=m[:n].any(0).sum() / bw, b=m[-n:].any(0).sum() / bw)
    return {k: bool(v >= thr) for k, v in run.items()}, {k: round(float(v), 3) for k, v in run.items()}

def place(code, fg, a, frame):
    fr = FRAMES[frame]; W, H = fr['W'], fr['H']
    h, w = a.shape
    m = a > 0.5
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    bw, bh = x1 - x0, y1 - y0
    touch, run = cut_sides(m, x0, x1, y0, y1)
    bleed_b = touch['b'] and kind(code) not in FLOOR_CATS
    k = min(fr['mw'] * W / bw, fr['mh'] * H / bh)
    ox = W / 2 - (x0 + bw / 2) * k
    oy = fr['floor'] * H - y1 * k
    if touch['l'] and touch['r']:
        # срезано с обеих сторон — изделие во всю ширину кадра
        k = W / bw; ox = -x0 * k; oy = fr['floor'] * H - y1 * k
    elif touch['l'] != touch['r']:
        # срез с одной стороны — изделие уходит за этот край, масштаб как у остальных
        k = min(1.06 * fr['mw'] * W / bw, fr['mh'] * H / bh)
        ox = -x0 * k if touch['l'] else W - x1 * k
        oy = fr['floor'] * H - y1 * k
    if bleed_b:
        if not (touch['l'] or touch['r']):
            k = min(fr['mw'] * W / bw, 0.9 * H / bh)
            ox = W / 2 - (x0 + bw / 2) * k
        oy = H - y1 * k
    if touch['t'] and not bleed_b:
        oy = -y0 * k
    # верхнее поле не меньше 4% кадра (кроме среза сверху и изделий во всю ширину)
    top = y0 * k + oy
    if not touch['t'] and not (touch['l'] and touch['r']) and top < 0.04 * H:
        k2 = k * (y1 * k + oy - 0.04 * H) / max(1.0, bh * k)
        if not (touch['l'] or touch['r']):
            cx = (x0 + bw / 2) * k + ox; ox = cx - (x0 + bw / 2) * k2
        elif touch['r'] and not touch['l']:
            ox = W - x1 * k2
        elif touch['l'] and not touch['r']:
            ox = -x0 * k2
        oy = (y1 * k + oy) - y1 * k2; k = k2
    M = np.float32([[k, 0, ox], [0, k, oy]])
    interp = cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC
    pm = fg * a[..., None]
    pm_c = cv2.warpAffine(pm, M, (W, H), flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    a_c = np.clip(cv2.warpAffine(a, M, (W, H), flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=0), 0, 1)
    fg_c = np.clip(pm_c / np.maximum(a_c[..., None], 1e-3), 0, 1)
    info = dict(depth=kind(code) in 'KO', k=float(k), bbox=[float((x0 * k + ox) / W), float((y0 * k + oy) / H), float((x1 * k + ox) / W), float((y1 * k + oy) / H)],
                touch=touch, run=run, bleed_b=bool(bleed_b))
    return fg_c, a_c, info

def shadow(a_c, info):
    """мягкая тень на белом полу: контакт под изделием + рассеянная тень (считается на уменьшенной копии)"""
    H, W = a_c.shape
    bx0, by0, bx1, by1 = info['bbox']
    oh = (by1 - by0) * H
    k = 4
    hs, ws = H // k, W // k
    m = cv2.resize((a_c > 0.5).astype(np.float32), (ws, hs), interpolation=cv2.INTER_AREA)
    ohs = oh / k
    s1 = np.zeros_like(m)
    d = max(1, int(round(ohs * 0.006)))
    s1[d:] = m[:-d]
    s1 = gauss(s1, max(1.0, ohs * 0.007))
    yb = by1 * hs
    sq = 0.07
    M = np.float32([[1.0, 0, 0], [0, sq, yb * (1 - sq) + ohs * 0.004]])
    s2 = cv2.warpAffine(m, M, (ws, hs), flags=cv2.INTER_AREA, borderValue=0)
    q = 4
    s2q = cv2.resize(s2, (ws // q, hs // q), interpolation=cv2.INTER_AREA)
    s2b = gauss(s2q, max(1.0, ohs * 0.03 / q)); s2b /= max(float(s2b.max()), 1e-4)
    s3 = gauss(s2b, max(2.0, ohs * 0.08 / q)); s3 /= max(float(s3.max()), 1e-4)
    s2b = cv2.resize(s2b, (ws, hs), interpolation=cv2.INTER_CUBIC)
    s3 = cv2.resize(s3, (ws, hs), interpolation=cv2.INTER_CUBIC)
    if info.get('depth'):
        # комплекс и ограда стоят на земле всей площадью: тень — под силуэтом, без «полосы» пола
        mq = cv2.resize(m, (ws // q, hs // q), interpolation=cv2.INTER_AREA)
        dq = max(1, int(round(ohs * 0.012 / q)))
        sd = np.zeros_like(mq); sd[dq:] = mq[:-dq]
        sd = gauss(sd, max(1.0, ohs * 0.025 / q))
        sd = cv2.resize(sd, (ws, hs), interpolation=cv2.INTER_CUBIC)
        Sh = 1 - (1 - 0.30 * s1) * (1 - 0.16 * np.clip(sd, 0, 1))
    else:
        Sh = 1 - (1 - 0.42 * s1) * (1 - 0.30 * np.clip(s2b, 0, 1)) * (1 - 0.10 * np.clip(s3, 0, 1))
    if info.get('bleed_b'): Sh *= 0.6
    Sh = cv2.resize(Sh, (W, H), interpolation=cv2.INTER_CUBIC)
    return np.clip(Sh, 0, 0.75).astype(np.float32)

def grain(shape, seed, S=1.0):
    rs = np.random.default_rng(seed)
    H, W = shape
    n1 = gauss(rs.standard_normal((H, W), dtype=np.float32), 0.55 * S); n1 /= max(float(n1.std()), 1e-6)
    n2 = gauss(rs.standard_normal((H, W), dtype=np.float32), 1.5 * S); n2 /= max(float(n2.std()), 1e-6)
    sp = gauss(rs.standard_normal((H, W), dtype=np.float32), 0.9 * S)
    sp = (sp > np.quantile(sp[::7, ::7], 0.988)).astype(np.float32)
    sp = gauss(sp, 0.6 * S)
    return 0.65 * n1 + 0.35 * n2, sp

def seed_of(code):
    return sum((i + 1) * ord(ch) for i, ch in enumerate(code)) * 7919 % (2 ** 31)

def finish(fg_c, a_c, Sh, code, full=True):
    H, W = a_c.shape
    tint = np.array([0.30, 0.285, 0.27], np.float32)    # тёплая серая тень
    bgl = 1 - Sh[..., None] * (1 - tint[None, None, :])
    out = fg_c * a_c[..., None] + bgl * (1 - a_c[..., None])
    obj = gauss(cv2.dilate((a_c > 0.02).astype(np.uint8), disk(4)).astype(np.float32), 2)
    Y = out[..., 0] * 0.2126 + out[..., 1] * 0.7152 + out[..., 2] * 0.0722
    S = max(H, W) / 3840.0
    det = 0.6 * (Y - gauss(Y, 2.0 * S)) + 0.25 * (Y - gauss(Y, 10 * S))  # чёткие грани и фаски
    out = out + (det * obj)[..., None]
    if full:
        ws, Y2 = stone_weight(np.clip(out, 0, 1), a_c)
        g, sp = grain((H, W), seed_of(code), S)
        amp = ws * (0.008 + 0.04 * np.clip(Y2, 0, 0.5))
        out = out + (g * amp + sp * ws * 0.05)[..., None]
    return np.clip(out, 0, 1)

def texture_point(o, m, avoid=(), Z=6.5, T=0.03, din=0.025):
    """«Фактура камня»: участок с самой богатой резьбой / рисунком внутри изделия (линза Z×).
    Фаски и контур по краю, трава цветника и места линз «грань» / «основание» не считаются;
    гладкая полированная стела → None (берём самую «глубокую» точку)."""
    H, W = m.shape
    s = 400 / max(H, W); sw, sh = max(8, round(W * s)), max(8, round(H * s))
    o = cv2.resize(o.astype(np.float32), (sw, sh), interpolation=cv2.INTER_AREA)
    mm = (cv2.resize(m.astype(np.float32), (sw, sh), interpolation=cv2.INTER_AREA) > 0.5).astype(np.float32)
    ys, xs = np.where(mm > 0)
    if not len(ys): return None
    y0, y1 = ys.min(), ys.max()
    Y = o @ np.float32([0.2126, 0.7152, 0.0722])
    gx = cv2.Sobel(Y, cv2.CV_32F, 1, 0, ksize=3) / 8; gy = cv2.Sobel(Y, cv2.CV_32F, 0, 1, ksize=3) / 8
    G = np.sqrt(gx * gx + gy * gy)
    dt = cv2.distanceTransform(np.pad(mm.astype(np.uint8), 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
    inner = (dt >= max(2.0, din * max(sw, sh))).astype(np.float32)
    green = ((o[..., 1] - np.maximum(o[..., 0], o[..., 2])) > 0.06).astype(np.float32)
    win = max(5, int(round(sw / Z * 0.7)) | 1); k = (win, win)
    cov = cv2.blur(mm, k)
    ge = cv2.blur(G * inner * (1 - green), k) / np.maximum(cov, 1e-3)
    gf = cv2.blur(green * mm, k) / np.maximum(cov, 1e-3)
    ok = (cov >= 0.88) & (gf < 0.15) & (mm > 0)
    ok[int(y0 + (y1 - y0) * 0.82):] = False
    yy, xx = np.mgrid[0:sh, 0:sw]
    for ax, ay in avoid:
        ok &= ((xx - ax * sw) ** 2 + (yy - ay * sh) ** 2) >= (0.9 * sw / Z) ** 2
    if not ok.any(): return None
    sc = np.where(ok, ge, -1.0)
    i = int(np.argmax(sc)); y, x = divmod(i, sw)
    return [round(x / sw, 4), round(y / sh, 4)] if sc.flat[i] >= T else None

def focus_points(a_c, info, out=None):
    H, W = a_c.shape
    m = (a_c > 0.5).astype(np.uint8)
    ys, xs = np.where(m > 0)
    bx0, by0, bx1, by1 = info['bbox']
    xn = (xs / W - bx0) / max(bx1 - bx0, 1e-3); yn = (ys / H - by0) / max(by1 - by0, 1e-3)
    i_tr = int(np.argmin((1 - xn) + yn)); i_br = int(np.argmax(xn + yn)); i_tl = int(np.argmin(xn + yn))
    dt = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    up = np.zeros_like(dt); y_lim = int((by0 + (by1 - by0) * 0.6) * H); up[:y_lim] = dt[:y_lim]
    ty, tx = np.unravel_index(int(np.argmax(up)), up.shape)
    def pt(i): return [round(float(xs[i]) / W, 4), round(float(ys[i]) / H, 4)]
    tex = [round(tx / W, 4), round(ty / H, 4)]
    if out is not None:
        tex = texture_point(out, m > 0, avoid=(pt(i_tr), pt(i_br))) or tex
    return dict(corner=pt(i_tr), base=pt(i_br), corner2=pt(i_tl), texture=tex)

def save_sizes(out, path_full, sizes=((None, 3840, 82), ('md', 1600, 84), ('sm', 640, 82))):
    im = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))
    res = {}
    d, f = os.path.split(path_full)
    for sub, L, q in sizes:
        k = L / max(im.size)
        t = im if k >= 1 else im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
        p = os.path.join(d, sub, f) if sub else path_full
        os.makedirs(os.path.dirname(p) or '.', exist_ok=True)
        t.save(p, 'WEBP', quality=q, method=5)
        res[sub or 'full'] = [t.size[0], t.size[1], os.path.getsize(p)]
    return res

def load_rgb(src):
    im = Image.open(src); alpha_in = None
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        im = im.convert('RGBA'); arr = np.asarray(im)
        if arr[..., 3].min() < 250:
            alpha_in = arr[..., 3]
            rgb = np.asarray(Image.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, 255)), im).convert('RGB'))
        else:
            rgb = arr[..., :3]
    else:
        rgb = np.asarray(im.convert('RGB'))
    return rgb, alpha_in

def process(src, code, outdir, model, frame=None, strength=1.0, mode=None):
    t0 = time.time()
    rgb, alpha_in = load_rgb(src)
    fg, a = matte(rgb, model, alpha_in, mode or ('ff' if kind(code) == 'K' else 'hybrid'))
    S = max(a.shape) / 3840.0
    fg = enhance_stone(fg, a, strength, S)
    frame = frame or frame_for(code)
    fg_c, a_c, info = place(code, fg, a, frame)
    Sh = shadow(a_c, info)
    out = finish(fg_c, a_c, Sh, code)
    fp = focus_points(a_c, info, out)
    sizes = save_sizes(out, os.path.join(outdir, code + '.webp'))
    info.update(frame=frame, focus=fp, sizes=sizes, sec=round(time.time() - t0, 1))
    return info

def manifest(cat_dir, parts_dir):
    """variants.json: размеры всех фото + кадр и точки «угол / основание / фактура» для обработанных студией"""
    items, focus, frames = {}, {}, {}
    old = {}
    try: old = json.load(open(os.path.join(cat_dir, 'variants.json')))
    except Exception: pass
    for k, v in (old.get('items') or {}).items(): items[k] = v
    for k, v in (old.get('focus') or {}).items(): focus[k] = v
    for k, v in (old.get('frame') or {}).items(): frames[k] = v
    for f in sorted(os.listdir(parts_dir)):
        if not f.endswith('.json'): continue
        for code, r in json.load(open(os.path.join(parts_dir, f))).items():
            if 'sizes' not in r: continue
            items[code] = r['sizes']['full'][:2]
            fp = r['focus']
            focus[code] = [round(v, 3) for v in fp['corner'] + fp['base'] + fp['texture']]
            frames[code] = r['frame']
    def key(c):
        import re
        m = re.match(r'([A-Za-z-]+)(\d*)', c); return (m.group(1), int(m.group(2) or 0)) if m else (c, 0)
    out = dict(v=2, studio='s2', sizes=dict(full=3840, md=1600, sm=640),
               items={k: items[k] for k in sorted(items, key=key)},
               frame={k: frames[k] for k in sorted(frames, key=key)},
               focus={k: focus[k] for k in sorted(focus, key=key)})
    with open(os.path.join(cat_dir, 'variants.json'), 'w') as fh:
        fh.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('manifest items:', len(items), 'studio:', len(focus))

def refocus(cat_dir):
    """пересчёт точки «фактура» в variants.json по готовым фото (без повторной обработки):
    изделие — всё, что заметно темнее белого фона студии"""
    path = os.path.join(cat_dir, 'variants.json'); v = json.load(open(path))
    n = 0
    for code, f in v.get('focus', {}).items():
        p = os.path.join(cat_dir, 'md', code + '.webp')
        if not os.path.exists(p): continue
        o = np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255.0
        m = cv2.morphologyEx(((1 - o.min(2)) > 0.12).astype(np.uint8), cv2.MORPH_OPEN, disk(1)).astype(bool)
        tp = texture_point(o, m, avoid=((f[0], f[1]), (f[2], f[3])))
        if tp: f[4], f[5] = round(tp[0], 3), round(tp[1], 3); n += 1
    v['studio'] = 's2'
    with open(path, 'w') as fh:
        fh.write(json.dumps(v, ensure_ascii=False, separators=(',', ':')) + '\n')
    print('refocus: texture by detail', n, 'of', len(v.get('focus', {})))

if __name__ == '__main__':
    # studio.py run <out_dir> <list.txt>   — строки «путь=код[:кадр[:режим]]»
    # studio.py manifest <assets/catalog> <parts_dir>
    model = os.environ.get('ISNET', 'isnet.onnx')
    cmd = sys.argv[1]
    if cmd == 'manifest':
        manifest(sys.argv[2], sys.argv[3]); sys.exit(0)
    if cmd == 'refocus':
        refocus(sys.argv[2]); sys.exit(0)
    outdir, lst = sys.argv[2], sys.argv[3]
    os.makedirs(outdir, exist_ok=True)
    res, bad = {}, []
    for line in open(lst, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'): continue
        src, _, spec = line.partition('=')
        parts = (spec or os.path.splitext(os.path.basename(src))[0]).split(':')
        code = parts[0]; frame = parts[1] if len(parts) > 1 and parts[1] else None; mode = parts[2] if len(parts) > 2 else None
        try:
            r = process(src, code, outdir, model, frame, 1.0, mode)
            res[code] = r
            print(code, r['frame'], r['sizes']['full'], r['sec'], 's', flush=True)
        except Exception as e:
            bad.append(code); print('FAIL', code, repr(e), flush=True)
    tag = os.environ.get('SHARD', '0')
    json.dump(res, open(os.path.join(outdir, 'studio-part-%s.json' % tag), 'w'), ensure_ascii=False)
    if bad: print('failed:', ' '.join(bad))
    # любой сбой — шард неуспешен: commit-шаг workflow не запустится, частичного обновления каталога не будет
    sys.exit(1 if bad else 0)
