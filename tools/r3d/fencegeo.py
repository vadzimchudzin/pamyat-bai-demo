# Гранитные ограды (O1–O12) для build.py: столбы, перемычки и панели по профилю, угловые элементы, шары, ковка.
# Параметры моделей — fencespec.py (метры). Ось X — фасад слева направо, Y — вглубь участка, Z — вверх.
import bpy, bmesh, math
from mathutils import Vector

def _sel(ob):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)

def _to_mesh(ob):
    _sel(ob); bpy.ops.object.convert(target='MESH'); return bpy.context.view_layer.objects.active

# ---------- профили верхней кромки: u ∈ [0, 1] вдоль пролёта, s0..s1 — доля стороны (для профилей «по стороне») ----------
def prof_fn(p, s0=0.0, s1=1.0):
    k = p['k']; H0 = p.get('h0', 0); H1 = p.get('h1', 0)
    S = lambda u: s0 + (s1 - s0) * u
    if k == 'flat':
        return lambda u: p['h']
    if k == 'arch':  # по стороне: низко у углов, плавный горб у среднего столба (O3)
        return lambda u: H0 + (H1 - H0) * math.sin(math.pi * S(u)) ** 2
    if k == 'ramp':  # по стороне: S-подъём от угла к полке у середины (O5)
        w = p.get('w', 0.8)
        def f(u):
            x = min(min(S(u), 1 - S(u)) * 2 / w, 1.0)
            return H0 + (H1 - H0) * x * x * x * (x * (6 * x - 15) + 10)
        return f
    if k == 'bell':  # горб в каждом пролёте: низко у столбов, S-подъём к середине (O3, O5)
        e = p.get('e', 1.3)
        return lambda u: H0 + (H1 - H0) * math.sin(math.pi * min(max(u, 0), 1)) ** e
    if k == 'dip':  # вогнутая дуга в каждом пролёте, высоко у столбов (O7, O8)
        e = p.get('e', 0.6)
        return lambda u: H1 - (H1 - H0) * math.sin(math.pi * min(max(u, 0), 1)) ** e
    if k == 'swoop':  # угловой элемент O4: выпуклое плечо у столба, вогнутый спуск к полке
        w = p.get('w', 0.8)
        return lambda u: H0 + (H1 - H0) * (1 + math.cos(math.pi * min(u / w, 1.0))) / 2
    if k == 'rise':  # угловой элемент O6: вогнутый подъём к углу
        e = p.get('e', 2.2)
        return lambda u: H0 + (H1 - H0) * (1 - u) ** e
    raise ValueError('profile ' + k)

# ---------- детали ----------
def slab(ctx, name, p0, p1, t, top, z0=0.0, bev=0.003, n=96, mat=None):
    """Вертикальная плита по линии p0→p1 толщиной t: низ z0, верх top(u). Кривая с фаской → чёткие скруглённые рёбра."""
    L = (Vector(p1) - Vector(p0)).length; ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = max(t / 2 - bev, 0.0004); cu.bevel_depth = bev; cu.bevel_resolution = 3; cu.resolution_u = 1
    pts = [(bev, z0 + bev), (L - bev, z0 + bev)]
    for i in range(n + 1):
        u = 1 - i / n; pts.append((bev + (L - 2 * bev) * u, top(u) - bev))
    q = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - q[-1][0]) + abs(p[1] - q[-1][1]) > 1e-5: q.append(p)
    sp = cu.splines.new('POLY'); sp.points.add(len(q) - 1)
    for i, (x, y) in enumerate(q): sp.points[i].co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    ob = ctx['link'](bpy.data.objects.new(name, cu)); ob.data.materials.append(mat or ctx['GM'])
    ob = _to_mesh(ob)
    ob.rotation_euler = (math.radians(90), 0, ang); ob.location = (p0[0], p0[1], 0)
    ctx['smooth'](ob, 30)
    return ob

def sphere(ctx, name, x, y, z, r, mat=None):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=r)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = ctx['link'](bpy.data.objects.new(name, me)); ob.data.materials.append(mat or ctx['GM']); ob.location = (x, y, z)
    return ob

def post(ctx, name, x, y, P, cap=None, ball=None):
    w, h = P['w'], P['h']
    ctx['box'](name, w, w, h, x, y, 0, ctx['GM'], 0.003); top = h
    if cap:
        ctx['box'](name + 'c', cap['w'], cap['w'], cap['h'], x, y, top - 0.0005, ctx['GM'], 0.003); top += cap['h'] - 0.0005
    if ball:
        pl = ball.get('plinth')
        if pl:
            ctx['box'](name + 'p', pl['w'], pl['w'], pl['h'], x, y, top - 0.0005, ctx['GM'], 0.002); top += pl['h'] - 0.0005
        r = ball['r']; nk = ball.get('neck', 0.35 * r)
        sphere(ctx, name + 'b', x, y, top + r * 0.96, r)

# ---------- ковка: «черепаха» рисует гладкие линии из отрезков и дуг (касательные непрерывны) ----------
class Turtle:
    def __init__(s, x, y, hd):
        s.x, s.y, s.h = x, y, math.radians(hd); s.p = [(x, y)]
    def fwd(s, L):
        n = max(2, int(L / 0.004))
        for i in range(1, n + 1):
            s.p.append((s.x + math.cos(s.h) * L * i / n, s.y + math.sin(s.h) * L * i / n))
        s.x, s.y = s.p[-1]; return s
    def arc(s, r, ang):  # ang > 0 — поворот влево (против часовой)
        a = math.radians(ang); sg = 1 if a > 0 else -1
        cx, cy = s.x - sg * r * math.sin(s.h), s.y + sg * r * math.cos(s.h)
        a0 = math.atan2(s.y - cy, s.x - cx); n = max(6, int(abs(a) * r / 0.0025) + 4)
        for i in range(1, n + 1):
            t = a0 + a * i / n; s.p.append((cx + r * math.cos(t), cy + r * math.sin(t)))
        s.x, s.y = s.p[-1]; s.h += a; return s
    def volute(s, r, left=True, half=3, q=0.68):  # завиток: полуокружности с убывающим радиусом
        for _ in range(half):
            s.arc(r, 180 if left else -180); r *= q
        return s

def mirror(pts, cx):
    return [(2 * cx - u, v) for u, v in pts]

def iron(ctx, name, lines, p0, p1, r=0.005):
    """Кованые прутки: lines — [(точки (u, v) в плоскости пролёта, радиус)], u — вдоль p0→p1, v — высота."""
    d = Vector((p1[0] - p0[0], p1[1] - p0[1], 0)); d.normalize(); o = Vector((p0[0], p0[1], 0))
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.fill_mode = 'FULL'
    cu.bevel_depth = r; cu.bevel_resolution = 3; cu.resolution_u = 1
    try: cu.use_fill_caps = True
    except Exception: pass
    for pts, rr in lines:
        if len(pts) < 2: continue
        sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, (u, v) in enumerate(pts):
            P = o + d * u + Vector((0, 0, v)); sp.points[i].co = (P.x, P.y, P.z, 1); sp.points[i].radius = rr / r
    ob = ctx['link'](bpy.data.objects.new(name, cu)); ob.data.materials.append(ctx['MT'])
    ob = _to_mesh(ob)
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def line(u0, v0, u1, v1):
    n = max(2, int(math.hypot(u1 - u0, v1 - v0) / 0.01))
    return [(u0 + (u1 - u0) * i / n, v0 + (v1 - v0) * i / n) for i in range(n + 1)]

def _s_pts(s, hd, k, turn, q):
    a = Turtle(0, 0, hd).arc(s * k, -turn).volute(s * q, left=False, half=3)
    b = Turtle(0, 0, hd + 180).arc(s * k, -turn).volute(s * q, left=False, half=3)
    return list(reversed(b.p)) + a.p[1:]

def sscroll(cx, cy, W, H, hd=0, R=0.006, mir=False, k=1.0, turn=115, q=0.44):
    """S-завиток, вписанный в прямоугольник W × H с центром (cx, cy) (центр симметрии завитка); hd=0 — вертикальный."""
    p = _s_pts(1.0, hd, k, turn, q); us = [x for x, _ in p]; vs = [y for _, y in p]
    w1 = max(max(us), -min(us)) * 2; h1 = max(max(vs), -min(vs)) * 2; sc = min(W / w1, H / h1)
    pts = [(cx + x * sc * (-1 if mir else 1), cy + y * sc) for x, y in p]
    return [(pts, R)]

def cscroll(u, v, s, hd, left, R=0.006, k=1.1, turn=80):
    """C-завиток: стебель-дуга от точки крепления и завиток внутрь."""
    t = Turtle(u, v, hd).arc(s * k, turn if left else -turn).volute(s * 0.62, left=left, half=3)
    return [(t.p, R)]

def iron12(L, top=0.40, bot=0.05, crest=0.09):
    """O12: две полосы, вертикальные прутья, S-завитки между прутьями, арка-гребень с завитками над верхней полосой."""
    e = 0.012; Ls = []
    Ls += [(line(-e, bot, L + e, bot), 0.0085), (line(-e, top, L + e, top), 0.0085)]
    n = max(5, round(L / 0.085)); us = [L * (i + 0.5) / n for i in range(n)]
    for u in us: Ls.append((line(u, bot, u, top), 0.0065))
    for i in range(n - 1):  # S-завитки касаются соседних прутьев
        g = (us[i] + us[i + 1]) / 2; w = us[i + 1] - us[i]
        Ls += sscroll(g, (bot + top) / 2 + 0.02, w - 0.008, (top - bot) * 0.62, R=0.0055, mir=(i % 2 == 1))
    k = 48; a0 = 0.03; a1 = L - 0.03
    Ls.append(([(a0 + (a1 - a0) * i / k, top + crest * math.sin(math.pi * i / k)) for i in range(k + 1)], 0.0075))
    m = L / 2
    for sg in (-1, 1):  # под аркой: горизонтальные S от центра к краям
        Ls += sscroll(m + sg * L * 0.17, top + crest * 0.42, L * 0.2, crest * 0.75, hd=90, R=0.0055, mir=(sg > 0))
    Ls += [(line(m, top, m, top + crest), 0.0058)]
    return Ls

def iron11(L, v0=0.15, peak=0.50, cap=0.555):
    """O11: нижняя и средняя полосы, над ними S-завитки до гребня-арки, две стойки, S-вставки между полосами."""
    e = 0.012; Ls = []; v1 = v0 + 0.11
    Ls += [(line(-e, v0, L + e, v0), 0.0085), (line(-e, v1, L + e, v1), 0.0085)]
    def cr(u):
        x = min(max(u / L, 0.0), 1.0); return v1 + 0.03 + (peak - v1 - 0.03) * math.sin(math.pi * x) ** 1.2
    k = 160; Ls.append(([(L * i / k, cr(L * i / k)) for i in range(k + 1)], 0.0078))
    for fu in (0.3, 0.7):  # стойки с завитком-навершием
        u = L * fu; tp = cr(u) + 0.045; Ls.append((line(u, v0, u, tp), 0.0068))
        Ls += cscroll(u, tp, 0.012, 90, fu < 0.5, R=0.0055, k=1.0, turn=120)
    # между средней полосой и гребнем: S-завитки во всю высоту просвета, зеркально от центра
    for side in (0, 1):
        for fu in (0.1, 0.2, 0.39, 0.47):
            u = L * fu if side == 0 else L - L * fu; g = cr(u) - v1
            if g < 0.06: continue
            Ls += sscroll(u, v1 + g / 2, min(0.11, L * 0.075), g - 0.004, R=0.0062, mir=(side == 1))
    for sg in (-1, 1):  # навершие гребня: пара завитков
        Ls += cscroll(L / 2 + sg * 0.012, cr(L / 2), 0.022, 90 - sg * 25, sg < 0, R=0.0058, k=1.2, turn=80)
    for fu in (0.1, 0.2, 0.4, 0.5, 0.6, 0.8, 0.9):
        Ls += sscroll(L * fu, (v0 + v1) / 2, 0.06, v1 - v0 - 0.004, R=0.0055, mir=(fu > 0.5))
    return Ls

# ---------- раскладка участка ----------
def build(F, ctx, X=2.0, Y=1.8):
    P = F['post']; pw = P['w']; hx, hy = X / 2 - pw / 2, Y / 2 - pw / 2
    FL, BL, BR, FR = (-hx, -hy), (-hx, hy), (hx, hy), (hx, -hy)
    lay = F['layout']; cap, ball = F.get('cap'), F.get('ball')
    def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    if lay == 'corners':  # O4, O6: только угловые элементы
        A = F['arm']; k = 0
        for c, nb in ((FL, (FR, BL)), (BL, (FL, BR)), (BR, (BL, FR)), (FR, (BR, FL))):
            post(ctx, 'P%d' % k, c[0], c[1], P, cap, ball)
            for j, o in enumerate(nb):
                d = Vector((o[0] - c[0], o[1] - c[1])); d.normalize()
                p0 = (c[0] + d.x * (pw / 2 - 0.012), c[1] + d.y * (pw / 2 - 0.012)); p1 = (c[0] + d.x * (pw / 2 + A['len']), c[1] + d.y * (pw / 2 + A['len']))
                slab(ctx, 'A%d%d' % (k, j), p0, p1, A['t'], prof_fn(A['prof']), 0.0, A.get('bev', 0.003))
            k += 1
        return
    # стороны: A слева (FL→BL), B сзади (BL→BR), C справа (FR→BR, с проходом у заднего угла), D фасад (FL→FR)
    sides = []
    for nm, a, b in (('A', FL, BL), ('B', BL, BR), ('C', FR, BR), ('D', FL, FR)):
        if lay == 'mid': ts = [0, 0.5, 1]
        else: ts = [0, 0.58, 1] if nm == 'C' else [0, 1]
        sides.append((nm, a, b, ts))
    posts = {}
    for nm, a, b, ts in sides:
        for t in ts:
            p = lerp(a, b, t); posts[(round(p[0], 4), round(p[1], 4))] = p
    for i, p in enumerate(posts.values()): post(ctx, 'P%d' % i, p[0], p[1], P, cap, ball)
    Fi = F['fill']; k = 0
    for nm, a, b, ts in sides:
        Ls = math.hypot(b[0] - a[0], b[1] - a[1])
        for j in range(len(ts) - 1):
            if nm == 'C' and j == len(ts) - 2: continue  # проход
            pa, pb = lerp(a, b, ts[j]), lerp(a, b, ts[j + 1])
            d = Vector((pb[0] - pa[0], pb[1] - pa[1])); d.normalize(); ins = pw / 2 - 0.012
            p0 = (pa[0] + d.x * ins, pa[1] + d.y * ins); p1 = (pb[0] - d.x * ins, pb[1] - d.y * ins)
            s0 = ts[j] + ins / Ls; s1 = ts[j + 1] - ins / Ls
            if Fi['type'] == 'slab':
                slab(ctx, 'S%d' % k, p0, p1, Fi['t'], prof_fn(Fi['prof'], s0, s1), Fi.get('z0', 0.0), Fi.get('bev', 0.003))
            else:
                L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
                if Fi['type'] == 'iron11':
                    B = Fi['base']; slab(ctx, 'S%d' % k, p0, p1, B['t'], prof_fn({'k': 'flat', 'h': B['h']}), 0.0, 0.003)
                    iron(ctx, 'I%d' % k, iron11(L - 0.024, v0=B['h'] + 0.03), (p0[0] + d.x * 0.012, p0[1] + d.y * 0.012), p1)
                else:
                    iron(ctx, 'I%d' % k, iron12(L - 0.024), (p0[0] + d.x * 0.012, p0[1] + d.y * 0.012), p1)
            k += 1
