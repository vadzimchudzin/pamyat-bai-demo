# Голубь для первого экрана (js/fx.js): процедурная модель — тело, голова, клюв, веер хвоста из 12 перьев,
# крылья из кроющих + 11 второстепенных и 10 первостепенных маховых. Цикл взмаха (12 кадров, с середины
# удара вниз) + кадр парения; размытие движения — среднее 3 подкадров. Рендер Cycles, прозрачный фон.
# Запуск: blender -b -P tools/dove/dove.py  →  python3 tools/dove/compose.py  →  assets/img/dove-flap.webp
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector

OUT = os.environ.get('OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frames'))
N = int(os.environ.get('N', 12))
RES = int(os.environ.get('RES', 640))
SPP = int(os.environ.get('SPP', 32))
ONLY = os.environ.get('ONLY')
PHI0 = float(os.environ.get('PHI0', 0.28))
YAW = float(os.environ.get('YAW', 12)); ELEV = float(os.environ.get('ELEV', -20))
OSC = float(os.environ.get('OSC', 2.6))
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------- утилиты ----------
def cr(pts, n):
    """Catmull-Rom через точки (списки чисел), n отрезков между соседними."""
    P = [np.array(p, float) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2])
    return np.array(out)

def per(keys, phi):
    """Периодический сплайн по ключам [(фаза, значение)], фаза 0..1, последний ключ = 1.0."""
    ks = sorted(keys)
    xs = [k[0] for k in ks]; ys = [k[1] for k in ks]
    if xs[-1] < 1.0: xs.append(1.0); ys.append(ys[0])
    phi = phi % 1.0
    n = len(xs)
    for i in range(n - 1):
        if xs[i] <= phi <= xs[i + 1]:
            break
    x1, x2 = xs[i], xs[i + 1]; y1, y2 = ys[i], ys[i + 1]
    y0 = ys[i - 1] if i > 0 else ys[-2]; x0 = xs[i - 1] if i > 0 else xs[-2] - 1
    y3 = ys[i + 2] if i + 2 < n else ys[1]; x3 = xs[i + 2] if i + 2 < n else 1 + xs[1]
    t = (phi - x1) / (x2 - x1) if x2 > x1 else 0
    m1 = (y2 - y0) / (x2 - x0) * (x2 - x1); m2 = (y3 - y1) / (x3 - x1) * (x2 - x1)
    h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t; h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
    return h00 * y1 + h10 * m1 + h01 * y2 + h11 * m2

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def rot(P, axis, pivot, ang):
    k = np.asarray(axis, float); k = k / np.linalg.norm(k)
    v = P - pivot
    c = np.cos(ang)[:, None]; s = np.sin(ang)[:, None]
    return pivot + v * c + np.cross(k, v) * s + k[None, :] * (v @ k)[:, None] * (1 - c)

def mk(name, verts, faces, mat, subd=2, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate(); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    if smooth:
        for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if subd:
        m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = subd; m.render_levels = subd
    return ob

def loft(st, ring=24, caps=True):
    V = []; F = []
    for (x, y, z, a, b) in st:
        for j in range(ring):
            t = 2 * math.pi * j / ring
            V.append((x, y + a * math.cos(t), z + b * math.sin(t)))
    S = len(st)
    for i in range(S - 1):
        for j in range(ring):
            j2 = (j + 1) % ring
            F.append((i * ring + j, i * ring + j2, (i + 1) * ring + j2, (i + 1) * ring + j))
    if caps:
        c0 = len(V); V.append(tuple(st[0][:3])); c1 = len(V); V.append(tuple(st[-1][:3]))
        for j in range(ring):
            j2 = (j + 1) % ring
            F.append((c0, j2, j)); F.append((c1, (S - 1) * ring + j, (S - 1) * ring + j2))
    return V, F

def material(name, col, rough=.55, sheen=.25, sss=.0, spec=.4):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Subsurface Radius'].default_value = (0.02, 0.015, 0.01)
    b.inputs['Specular IOR Level'].default_value = spec
    return m

WHITE = material('feather', (0.93, 0.92, 0.90), rough=.6, sheen=.35, sss=.08)
WING = material('wing', (0.94, 0.93, 0.91), rough=.55, sheen=.3, sss=.05)
BEAK = material('beak', (0.62, 0.48, 0.44), rough=.4, sheen=0)
EYE = material('eye', (0.03, 0.02, 0.02), rough=.15, sheen=0, spec=.8)

# ---------- тело ----------
body_ctrl = [  # x, полуширина, полувысота, центр z
    (-0.55, 0.010, 0.004, 0.036),
    (-0.50, 0.048, 0.016, 0.034),
    (-0.42, 0.062, 0.034, 0.030),
    (-0.30, 0.095, 0.075, 0.016),
    (-0.15, 0.140, 0.122, 0.000),
    (0.00, 0.162, 0.156, -0.008),
    (0.14, 0.160, 0.166, 0.000),
    (0.26, 0.120, 0.130, 0.036),
    (0.35, 0.074, 0.082, 0.078),
    (0.42, 0.066, 0.072, 0.098),
    (0.48, 0.068, 0.074, 0.108),
    (0.53, 0.050, 0.054, 0.106),
    (0.565, 0.010, 0.012, 0.100),
]
bs = cr([list(c) for c in body_ctrl], 6)
body = mk('body', *loft([(x, 0.0, zc, w, h) for (x, w, h, zc) in bs], ring=28), WHITE)

beak = mk('beak', *loft([(0.548, 0, 0.098, 0.017, 0.015), (0.575, 0, 0.096, 0.011, 0.010), (0.605, 0, 0.092, 0.005, 0.005), (0.622, 0, 0.089, 0.001, 0.001)], ring=12), BEAK, subd=1)
for sy in (1, -1):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, location=(0.505, 0.051 * sy, 0.118), segments=16, ring_count=8)
    e = bpy.context.active_object; e.data.materials.append(EYE)
    for p in e.data.polygons: p.use_smooth = True

# ---------- перо: плоская лопасть с закруглённым концом ----------
def feather(base, ang, length, width, z0=0.0, droop=0.03, nt=10, taper=0.55, rnd=0.22):
    """base=(x,y) в плоскости крыла; ang — направление от -X к +Y, градусы."""
    a = math.radians(ang)
    d = np.array([-math.cos(a), math.sin(a)]); n = np.array([d[1], -d[0]])  # n — «наружу-вперёд»
    V = []; F = []
    cols = (-1.0, -0.35, 0.0, 0.35, 1.0)
    for i in range(nt + 1):
        t = i / nt
        if t <= 1 - rnd: w = width * (taper + (1 - taper) * min(1.0, t / 0.35))
        else:
            u = (t - (1 - rnd)) / rnd
            w = width * math.sqrt(max(0.0, 1 - u * u)) + 1e-4
        for c in cols:
            p = np.array(base) + d * (t * length) + n * (c * w / 2)
            z = z0 - droop * t * t * length - 0.004 * abs(c) * width / 0.06
            V.append((p[0], p[1], z))
    m = len(cols)
    for i in range(nt):
        for j in range(m - 1):
            a0 = i * m + j
            F.append((a0, a0 + 1, a0 + m + 1, a0 + m))
    return V, F

def merge(parts):
    V = []; F = []; TAG = []
    for tag, (v, f) in parts:
        o = len(V); V += list(v); F += [tuple(x + o for x in ff) for ff in f]; TAG += [tag] * len(v)
    return V, F, TAG

# ---------- хвост: веер из 12 перьев + кроющие ----------
def tail_parts():
    parts = []
    nf = 12
    for k in range(nf):
        f = (k + 0.5) / nf * 2 - 1           # -1..1
        ang = 90 + f * 24                    # 90 = строго назад (-X) в плоскости XY
        a = math.radians(ang)
        base = (-0.33, f * 0.04)
        v, fc = feather(base, 0, 0.37 - 0.03 * abs(f), 0.066, z0=0.034 - 0.012 * abs(f) + 0.0012 * (k if f < 0 else nf - k), droop=-0.05, taper=0.7, rnd=0.28)
        # повернуть перо: feather() строит вдоль -X при ang=0 → поворот вокруг базы на (ang-90)
        rr = math.radians(-(ang - 90))
        v2 = []
        for (x, y, z) in v:
            dx, dy = x - base[0], y - base[1]
            v2.append((base[0] + dx * math.cos(rr) - dy * math.sin(rr), base[1] + dx * math.sin(rr) + dy * math.cos(rr), z))
        parts.append((0, (v2, fc)))
    return parts
TV, TF, _ = merge(tail_parts())
tail = mk('tail', TV, TF, WHITE, subd=1)

# ---------- крыло (левое, размах вдоль +Y): кроющие + маховые ----------
L = 1.02
wing_ctrl = [  # s, передняя кромка, задняя кромка (контур крыла), толщина
    (0.00, 0.120, -0.175, 0.050),
    (0.12, 0.135, -0.205, 0.042),
    (0.26, 0.150, -0.225, 0.034),
    (0.40, 0.152, -0.228, 0.026),
    (0.52, 0.132, -0.222, 0.018),
    (0.66, 0.090, -0.205, 0.012),
    (0.80, 0.035, -0.172, 0.008),
    (0.90, -0.010, -0.140, 0.006),
    (0.96, -0.045, -0.115, 0.004),
    (1.00, -0.080, -0.090, 0.002),
]
def edge(s):
    a = np.array(wing_ctrl)
    return np.interp(s, a[:, 0], a[:, 1]), np.interp(s, a[:, 0], a[:, 2]), np.interp(s, a[:, 0], a[:, 3])

def coverts(smax=0.80, back=0.085):
    st = cr([[s, le, te, T] for (s, le, te, T) in wing_ctrl if s <= smax + 1e-6] + [[smax + 0.03, *edge(smax + 0.03)]], 5)
    NR = 18; V = []; F = []
    rows = []
    for (s, le, te, T) in st:
        k_end = sstep(smax - 0.12, smax + 0.03, s)
        te2 = te + back + (le - te - back) * 0.55 * k_end      # кроющие короче контура; к концу кисти сходятся
        ch = max(0.004, le - te2)
        row = []
        for k in range(NR):
            ang = 2 * math.pi * k / NR
            p = (1 + math.cos(ang)) / 2; q = 1 - p
            x = te2 + ch * p
            th = (math.sqrt(q) * (1 - q) / 0.3849) * T * (1 - 0.7 * k_end) if 0 < q < 1 else 0
            z = 0.035 * ch * 4 * q * (1 - q) + 0.5 * th * (1 if math.sin(ang) >= 0 else -1)
            V.append((x, s * L, z + 0.006))
    S = len(st)
    for i in range(S - 1):
        for k in range(NR):
            k2 = (k + 1) % NR
            F.append((i * NR + k, i * NR + k2, (i + 1) * NR + k2, (i + 1) * NR + k))
    c1 = len(V); V.append((float(np.mean([v[0] for v in V[-NR:]])), (smax + 0.03) * L, 0.006))
    for k in range(NR):
        F.append((c1, (S - 1) * NR + k, (S - 1) * NR + (k + 1) % NR))
    return V, F

def wing_parts():
    parts = [(0, coverts())]
    # второстепенные маховые вдоль «руки»
    ns = 11
    for i in range(ns):
        s = 0.03 + i * 0.037
        le, te, T = edge(s)
        bx = le - 0.075
        ln_ = (bx - te) + 0.018
        parts.append((1, feather((bx, s * L), 6 + i * 1.2, ln_, 0.066, z0=-0.002 - 0.0012 * i, droop=0.02, taper=0.8, rnd=0.3)))
    # первостепенные маховые — веер кисти; концы ложатся на контур крыла
    npf = 10
    for j in range(npf):
        t = j / (npf - 1)
        sb = 0.42 + 0.30 * t                       # основание вдоль кисти
        le_b, _, _ = edge(sb)
        bx, by = le_b - 0.045, sb * L
        st_ = 0.47 + 0.53 * t ** 0.9               # конец пера на контуре
        le_t, te_t, _ = edge(min(st_, 1.0))
        tx = te_t - 0.018 * (1 - t) if t < 1 else -0.085
        ty = min(st_, 1.0) * L + (0.04 if t > 0.95 else 0.012 * t)
        dx, dy = tx - bx, ty - by
        ln_ = math.hypot(dx, dy)
        ang = math.degrees(math.atan2(dy, -dx))
        wdt = 0.060 - 0.016 * t
        parts.append((2 + j, feather((bx, by), ang, ln_, wdt, z0=-0.004 - 0.0016 * j, droop=0.035, taper=0.75 if t < 0.6 else 0.55, rnd=0.26 if t < 0.6 else 0.34)))
    return parts
WVl, WFl, WTAG = merge(wing_parts())
WV = np.array(WVl); WTAG = np.array(WTAG)
WS = np.clip(WV[:, 1] / L, 0, 1.25)
WL = mk('wingL', WV, WFl, WING, subd=1)
WR = mk('wingR', WV * np.array([1, -1, 1]), [tuple(reversed(f)) for f in WFl], WING, subd=1)

SH = np.array([0.0, 0.055, 0.072])   # плечо (в координатах птицы)
SW = 0.40                            # запястье, доля размаха

def pose(phi=None, glide=False):
    if glide:
        P = dict(elev=9, hand=5, sweep=12, arm=0, twist=2, htw=2, bob=0, fan=1.0)
    else:
        P = dict(
            elev=per([(0.00, 64), (0.14, 50), (0.28, 13), (0.42, -26), (0.55, -38), (0.66, -22), (0.78, 14), (0.90, 50)], phi),
            hand=per([(0.00, 12), (0.15, 14), (0.30, 6), (0.45, -8), (0.55, -16), (0.65, -24), (0.76, -16), (0.88, 6), (0.95, 16)], phi),
            sweep=per([(0.00, 6), (0.20, 1), (0.45, 3), (0.58, 24), (0.68, 54), (0.80, 50), (0.90, 22)], phi),
            arm=per([(0.00, 0), (0.30, -4), (0.50, 0), (0.62, 10), (0.74, 18), (0.86, 10)], phi),
            twist=per([(0.00, 4), (0.25, 10), (0.48, 6), (0.62, -10), (0.80, -14), (0.95, -2)], phi),
            htw=per([(0.00, 0), (0.30, 8), (0.55, 0), (0.70, -18), (0.90, -6)], phi),
            bob=0.018 * math.sin(2 * math.pi * (phi - 0.28)),
            fan=per([(0.00, 0.95), (0.30, 1.05), (0.55, 0.95), (0.70, 0.55), (0.88, 0.75)], phi))
    r = math.radians
    P0 = WV.copy()
    fan = P.get('fan', 1.0)
    if fan != 1.0:
        for j in range(10):
            idx = WTAG == 2 + j
            if not idx.any(): continue
            b = P0[idx][0].copy()
            P0[idx] = rot(P0[idx], (0, 0, 1), np.array([b[0], b[1], 0.0]), np.full(idx.sum(), r((1 - fan) * (j - 4.5) * 4.0)))
    wh = sstep(SW - 0.09, SW + 0.09, WS)
    piv_w = np.array([0.10, SW * L, 0.0])
    P0 = rot(P0, (0, 1, 0), piv_w, r(P['htw']) * wh * (WS - SW) / (1 - SW) * 1.6)
    P0 = rot(P0, (0, 0, 1), piv_w, r(P['sweep']) * wh)
    P0 = rot(P0, (1, 0, 0), piv_w, r(P['hand']) * wh)
    wr = sstep(0.0, 0.13, WS)
    piv_s = np.array([0.06, 0.0, 0.0])
    P0 = rot(P0, (0, 1, 0), piv_s, r(P['twist']) * wr)
    P0 = rot(P0, (0, 0, 1), piv_s, r(P['arm']) * wr)
    P0 = rot(P0, (1, 0, 0), piv_s, r(P['elev']) * wr)
    P0 = P0 + SH
    for ob, m in ((WL, 1), (WR, -1)):
        co = P0 * np.array([1, m, 1])
        co[:, 2] += P['bob']
        ob.data.vertices.foreach_set('co', co.astype(np.float32).ravel())
        ob.data.update()
    for ob in (body, beak, tail):
        ob.location.z = P['bob']
    for ob in bpy.data.objects:
        if ob.name.startswith('Sphere'): ob.location.z = 0.118 + P['bob']

# ---------- свет, камера, рендер ----------
w = bpy.data.worlds.new('sky'); sc.world = w; w.use_nodes = True
nt = w.node_tree; nd = nt.nodes; ln = nt.links
bg = nd['Background']
tc = nd.new('ShaderNodeTexCoord'); sep = nd.new('ShaderNodeSeparateXYZ'); mr = nd.new('ShaderNodeMapRange'); ramp = nd.new('ShaderNodeValToRGB')
ln.new(tc.outputs['Generated'], sep.inputs[0])
ln.new(sep.outputs['Z'], mr.inputs['Value'])
mr.inputs['From Min'].default_value = -1; mr.inputs['From Max'].default_value = 1
ln.new(mr.outputs['Result'], ramp.inputs['Fac'])
ramp.color_ramp.elements[0].color = (0.60, 0.53, 0.46, 1)
ramp.color_ramp.elements[1].color = (0.70, 0.78, 0.92, 1)
e = ramp.color_ramp.elements.new(0.5); e.color = (0.95, 0.88, 0.80, 1)
ln.new(ramp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = float(os.environ.get('SKY', 0.75))

sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = float(os.environ.get('SUN', 3.6)); sun.color = (1.0, 0.93, 0.84); sun.angle = math.radians(4)
so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
ldir = Vector((0.35, -0.55, 1.0)).normalized()
so.rotation_euler = (-ldir).to_track_quat('-Z', 'Y').to_euler()

cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = OSC
co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
y, el = math.radians(YAW), math.radians(ELEV)
d = Vector((math.sin(y) * math.cos(el), -math.cos(y) * math.cos(el), math.sin(el)))
tgt = Vector((-0.05, 0, 0.12))
co.location = tgt + d * 10
co.rotation_euler = (tgt - co.location).to_track_quat('-Z', 'Y').to_euler()

r = sc.render
r.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SPP; sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6
r.resolution_x = RES; r.resolution_y = RES; r.resolution_percentage = 100
r.film_transparent = True
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'; r.image_settings.color_depth = '8'
sc.view_settings.view_transform = os.environ.get('VT', 'Standard')
sc.view_settings.look = os.environ.get('LOOK', 'None')
sc.view_settings.exposure = float(os.environ.get('EXP', 0.0))
r.threads_mode = 'AUTO'

BLUR = int(os.environ.get('BLUR', 3)); SHUT = float(os.environ.get('SHUT', 0.6))
frames = [(f, (PHI0 + f / N) % 1.0, False) for f in range(N)] + [(N, 0, True)]
only = set(int(x) for x in ONLY.split(',')) if ONLY else None
for f, phi, gl in frames:
    if only is not None and f not in only: continue
    subs = [0.0] if (gl or BLUR < 2) else [(k / (BLUR - 1) - 0.5) * SHUT for k in range(BLUR)]
    for k, off in enumerate(subs):
        pose((phi + off / N) % 1.0, gl)
        r.filepath = os.path.join(OUT, 'f%02d_%d.png' % (f, k))
        bpy.ops.render.render(write_still=True)
    print('frame', f, 'phi %.3f' % phi, 'subs', len(subs), flush=True)
