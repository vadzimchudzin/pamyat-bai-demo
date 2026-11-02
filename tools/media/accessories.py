# ПАМЯТЬ.БАЙ — студийные рендеры аксессуаров каталога (Blender 4.2, Cycles).
# Запуск: blender -b -P tools/media/accessories.py -- <out_dir> [long_edge] [samples] [codes...]
# Камень — полированный габбро-диабаз (чёрный). Фон прозрачный, мягкая тень — shadow catcher;
# на белый фон кладёт tools/media/process.mjs.
import bpy, bmesh, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/acc'
LONG = int(argv[1]) if len(argv) > 1 else 1200
SAMPLES = int(argv[2]) if len(argv) > 2 else 48
ONLY = set(argv[3:])
os.makedirs(OUT, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception: pass
    sc.cycles.max_bounces = 8; sc.cycles.glossy_bounces = 4; sc.cycles.transmission_bounces = 6
    sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    return sc

# ---------- материалы ----------
def granite(name='Granite', base=(0.008, 0.008, 0.0085), rough=0.06):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    p = N['Principled BSDF']
    p.inputs['Roughness'].default_value = rough
    p.inputs['IOR'].default_value = 1.56
    tc = N.new('ShaderNodeTexCoord')
    # мелкое зерно габбро: редкие светлые вкрапления + лёгкая неоднородность
    vor = N.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 260.0
    vor.feature = 'F1'
    L.new(tc.outputs['Object'], vor.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.05, 0.049, 0.047, 1)
    ramp.color_ramp.elements[1].position = 0.06; ramp.color_ramp.elements[1].color = (base[0], base[1], base[2], 1)
    L.new(vor.outputs['Distance'], ramp.inputs['Fac'])
    noi = N.new('ShaderNodeTexNoise'); noi.inputs['Scale'].default_value = 9.0; noi.inputs['Detail'].default_value = 6
    L.new(tc.outputs['Object'], noi.inputs['Vector'])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.35
    L.new(ramp.outputs['Color'], mix.inputs['A'])
    L.new(noi.outputs['Color'], mix.inputs['B'])
    L.new(mix.outputs['Result'], p.inputs['Base Color'])
    # шероховатость чуть «плавает» — живая полировка
    rr = N.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough * 0.7; rr.inputs['To Max'].default_value = rough * 1.6
    L.new(noi.outputs['Fac'], rr.inputs['Value']); L.new(rr.outputs['Result'], p.inputs['Roughness'])
    return m

def simple(name, color, rough=0.4, metal=0.0, emit=None, strength=0.0, transmission=0.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if transmission: p.inputs['Transmission Weight'].default_value = transmission
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    if alpha < 1: p.inputs['Alpha'].default_value = alpha
    return m

# ---------- геометрия ----------
def obj_from_bm(bm, name, mat=None, smooth=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    if mat: ob.data.materials.append(mat)
    if smooth:
        for f in ob.data.polygons: f.use_smooth = True
    return ob

def bevel(ob, w=0.004, seg=3):
    md = ob.modifiers.new('bevel', 'BEVEL'); md.width = w; md.segments = seg; md.limit_method = 'ANGLE'
    md.angle_limit = math.radians(40); md.harden_normals = True
    return ob

def box(name, sx, sy, sz, loc=(0, 0, 0), mat=None, bev=0.004):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc) + Vector((0, 0, sz / 2)), verts=bm.verts)
    ob = obj_from_bm(bm, name, mat)
    if bev: bevel(ob, bev)
    return ob

def lathe(name, prof, mat=None, steps=96, loc=(0, 0, 0)):
    """prof: [(r, z), ...] снизу вверх, r=0 на оси закрывает торцы"""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    for a, b in zip(vs[:-1], vs[1:]): bm.edges.new((a, b))
    bmesh.ops.spin(bm, geom=bm.verts[:] + bm.edges[:], cent=(0, 0, 0), axis=(0, 0, 1), angle=math.radians(360), steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    ob = obj_from_bm(bm, name, mat, smooth=True)
    ws = ob.modifiers.new('ws', 'WEIGHTED_NORMAL'); ws.keep_sharp = True
    return ob

def smooth_profile(pts, n=8):
    """сглаживание ломаной (Catmull-Rom) — плавные изгибы вазы"""
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = [Vector(P[i + k]) for k in (-1, 0, 1, 2)]
        for s in range(n):
            t = s / n; t2 = t * t; t3 = t2 * t
            v = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((max(0.0, v.x), v.y))
    out.append(pts[-1])
    return out

def cut(target, cutter):
    md = target.modifiers.new('cut', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = cutter; md.solver = 'EXACT'
    cutter.hide_render = True; cutter.display_type = 'WIRE'
    bpy.context.view_layer.objects.active = target
    # модификатор фаски должен идти после булевой операции
    names = [m.name for m in target.modifiers]
    if 'bevel' in names:
        bpy.ops.object.modifier_move_to_index(modifier='cut', index=0)
    return md

def arch_cutter(name, w, h, depth, z0, axis='x'):
    """арочное окно: прямоугольник + полукруг сверху; ось сквозного выреза — X или Y"""
    bm = bmesh.new()
    r = w / 2; pts = [(-r, z0), (r, z0), (r, z0 + h - r)]
    for i in range(1, 16):
        a = math.pi * i / 16; pts.append((r * math.cos(a), z0 + h - r + r * math.sin(a)))
    pts.append((-r, z0 + h - r))
    vs = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, vec=(0, depth, 0), verts=[v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(bm, name)
    if axis == 'y': ob.rotation_euler.z = math.radians(90)
    return ob

def cross_cutter(name, w, h, bar, depth, z0, cz):
    a = box(name + 'v', bar, depth, h, (0, 0, z0), None, 0)
    b = box(name + 'h', w, depth, bar, (0, 0, cz - bar / 2), None, 0)
    md = a.modifiers.new('u', 'BOOLEAN'); md.operation = 'UNION'; md.object = b; md.solver = 'EXACT'
    b.hide_render = True
    bpy.context.view_layer.objects.active = a
    bpy.ops.object.modifier_apply(modifier='u')
    bpy.data.objects.remove(b)
    return a

def pyramid(name, s, h, z0, mat):
    bm = bmesh.new(); r = s / 2
    b = [bm.verts.new(v) for v in ((-r, -r, z0), (r, -r, z0), (r, r, z0), (-r, r, z0))]
    t = bm.verts.new((0, 0, z0 + h))
    bm.faces.new(b[::-1])
    for i in range(4): bm.faces.new((b[i], b[(i + 1) % 4], t))
    ob = obj_from_bm(bm, name, mat); bevel(ob, 0.002, 2)
    return ob

def gable(name, sx, sy, h, z0, mat):
    bm = bmesh.new(); x, y = sx / 2, sy / 2
    v = [bm.verts.new(p) for p in ((-x, -y, z0), (x, -y, z0), (x, y, z0), (-x, y, z0), (0, -y, z0 + h), (0, y, z0 + h))]
    bm.faces.new((v[3], v[2], v[1], v[0])); bm.faces.new((v[0], v[1], v[4])); bm.faces.new((v[2], v[3], v[5]))
    bm.faces.new((v[1], v[2], v[5], v[4])); bm.faces.new((v[3], v[0], v[4], v[5]))
    ob = obj_from_bm(bm, name, mat); bevel(ob, 0.003, 2)
    return ob

def candle(z0, mats, r=0.022, h=0.06):
    wax, flame = mats
    c = lathe('candle', [(0, z0), (r, z0), (r, z0 + h), (r * 0.9, z0 + h + 0.003), (0, z0 + h + 0.002)], wax, 48)
    f = lathe('flame', smooth_profile([(0, z0 + h + 0.006), (0.006, z0 + h + 0.014), (0.0055, z0 + h + 0.024), (0.0, z0 + h + 0.042)], 6), flame, 32)
    pl = bpy.data.lights.new('flameL', 'POINT'); pl.energy = 2.2; pl.color = (1.0, 0.62, 0.28); pl.shadow_soft_size = 0.006
    lo = bpy.data.objects.new('flameL', pl); lo.location = (0, 0, z0 + h + 0.02); bpy.context.collection.objects.link(lo)
    return c, f

# ---------- модели (размеры в метрах) ----------
def m_V1(M):   # ваза «Кубок» на квадратном постаменте
    box('plinth', 0.15, 0.15, 0.035, (0, 0, 0), M['g'], 0.004)
    prof = smooth_profile([(0.0, 0.035), (0.055, 0.035), (0.052, 0.05), (0.03, 0.062), (0.024, 0.09), (0.026, 0.12),
                           (0.05, 0.17), (0.082, 0.235), (0.093, 0.29), (0.096, 0.315), (0.088, 0.318),
                           (0.078, 0.30), (0.062, 0.24), (0.0, 0.215)], 8)
    lathe('vase', prof, M['g'])

def m_V2(M):   # ваза «Тюльпан»
    prof = smooth_profile([(0.0, 0.0), (0.08, 0.0), (0.08, 0.025), (0.06, 0.035), (0.05, 0.06), (0.066, 0.14),
                           (0.078, 0.22), (0.07, 0.3), (0.056, 0.355), (0.06, 0.39), (0.076, 0.42), (0.07, 0.423),
                           (0.05, 0.39), (0.042, 0.34), (0.0, 0.32)], 8)
    lathe('vase', prof, M['g'])

def lantern_body(M, s, h, z0, win):
    body = box('body', s, s, h, (0, 0, z0), M['g'], 0.003)
    cut(body, arch_cutter('w1', win[0], win[1], s * 1.6, z0 + win[2], 'x'))
    cut(body, arch_cutter('w2', win[0], win[1], s * 1.6, z0 + win[2], 'y'))
    inner = box('cav', s - 0.03, s - 0.03, h - 0.03, (0, 0, z0 + 0.015), None, 0)
    cut(body, inner)
    g = box('glass', s - 0.026, s - 0.026, h - 0.026, (0, 0, z0 + 0.013), M['glass'], 0)
    return body

def m_L1(M):   # лампада гранитная: основание, корпус с арочными окнами, пирамидальная крышка
    box('base', 0.165, 0.165, 0.035, (0, 0, 0), M['g'], 0.004)
    lantern_body(M, 0.13, 0.19, 0.035, (0.07, 0.13, 0.03))
    box('cornice', 0.16, 0.16, 0.02, (0, 0, 0.225), M['g'], 0.003)
    pyramid('roof', 0.16, 0.095, 0.245, M['g'])
    lathe('finial', smooth_profile([(0, 0.335), (0.012, 0.336), (0.017, 0.35), (0.012, 0.364), (0, 0.366)], 6), M['g'], 48)
    candle(0.05, (M['wax'], M['flame']))

def m_L2(M):   # лампада «Часовня»: крестовое окно, двускатная крыша, крест
    box('base', 0.2, 0.2, 0.04, (0, 0, 0), M['g'], 0.004)
    body = box('body', 0.16, 0.16, 0.24, (0, 0, 0.04), M['g'], 0.003)
    cut(body, cross_cutter('cx', 0.09, 0.15, 0.03, 0.3, 0.085, 0.18))
    cc = cross_cutter('cy', 0.09, 0.15, 0.03, 0.3, 0.085, 0.18); cc.rotation_euler.z = math.radians(90); cut(body, cc)
    cut(body, box('cav', 0.125, 0.125, 0.2, (0, 0, 0.058), None, 0))
    box('glass', 0.13, 0.13, 0.205, (0, 0, 0.056), M['glass'], 0)
    box('cornice', 0.19, 0.19, 0.02, (0, 0, 0.28), M['g'], 0.003)
    gable('roof', 0.2, 0.2, 0.1, 0.3, M['g'])
    box('cr1', 0.014, 0.014, 0.08, (0, 0, 0.395), M['brass'], 0.002)
    box('cr2', 0.05, 0.014, 0.014, (0, 0, 0.445), M['brass'], 0.002)
    candle(0.058, (M['wax'], M['flame']), 0.026, 0.07)

def m_S1(M):   # шар на ступенчатой подставке
    box('s1', 0.2, 0.2, 0.03, (0, 0, 0), M['g'], 0.004)
    box('s2', 0.16, 0.16, 0.03, (0, 0, 0.03), M['g'], 0.004)
    lathe('neck', smooth_profile([(0, 0.06), (0.045, 0.06), (0.032, 0.075), (0.028, 0.085), (0, 0.086)], 6), M['g'], 64)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=0.075)
    bmesh.ops.translate(bm, vec=(0, 0, 0.155), verts=bm.verts)
    obj_from_bm(bm, 'ball', M['g'], smooth=True)

def m_T1(M):   # круглый столик на балясине
    box('foot', 0.3, 0.3, 0.05, (0, 0, 0), M['g'], 0.006)
    prof = smooth_profile([(0, 0.05), (0.1, 0.05), (0.1, 0.07), (0.07, 0.085), (0.05, 0.13), (0.075, 0.24), (0.07, 0.33),
                           (0.045, 0.42), (0.04, 0.52), (0.06, 0.6), (0.085, 0.64), (0.0, 0.645)], 8)
    lathe('leg', prof, M['g'])
    top = lathe('top', [(0, 0.64), (0.235, 0.64), (0.25, 0.655), (0.25, 0.672), (0.24, 0.682), (0, 0.682)], M['g'], 128)

def m_T2(M):   # скамья: плита на двух опорах
    for x in (-0.36, 0.36):
        box('leg', 0.08, 0.3, 0.39, (x, 0, 0), M['g'], 0.005)
    seat = box('seat', 1.0, 0.35, 0.06, (0, 0, 0.39), M['g'], 0.012)

def m_G1(M):   # вазон прямоугольный с белым щебнем
    b = box('planter', 0.42, 0.22, 0.15, (0, 0, 0), M['g'], 0.004)
    cut(b, box('in', 0.36, 0.16, 0.2, (0, 0, 0.03), None, 0))
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=180, y_segments=90, size=0.5)
    bmesh.ops.scale(bm, vec=(0.36, 0.16, 1), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, 0.128), verts=bm.verts)
    gr = obj_from_bm(bm, 'gravel', M['gravel'], smooth=True)
    tx = bpy.data.textures.new('gv', 'VORONOI'); tx.noise_scale = 0.012
    d = gr.modifiers.new('d', 'DISPLACE'); d.texture = tx; d.strength = 0.012; d.mid_level = 0.6

MODELS = [('V1', m_V1, 1.0), ('V2', m_V2, 1.0), ('L1', m_L1, 1.0), ('L2', m_L2, 1.0),
          ('S1', m_S1, 1.0), ('T1', m_T1, 1.0), ('T2', m_T2, 1.0), ('G1', m_G1, 1.0)]

# ---------- студия ----------
def world(sc):
    w = bpy.data.worlds.new('studio'); sc.world = w; w.use_nodes = True
    N = w.node_tree.nodes; L = w.node_tree.links; N.clear()
    out = N.new('ShaderNodeOutputWorld')
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Generated'], sep.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -0.15; mr.inputs['From Max'].default_value = 0.75
    L.new(sep.outputs['Z'], mr.inputs['Value'])
    lo = N.new('ShaderNodeBackground'); lo.inputs['Color'].default_value = (0.004, 0.004, 0.004, 1); lo.inputs['Strength'].default_value = 1
    hi = N.new('ShaderNodeBackground'); hi.inputs['Color'].default_value = (0.16, 0.16, 0.17, 1); hi.inputs['Strength'].default_value = 1.0
    mx = N.new('ShaderNodeMixShader')
    L.new(mr.outputs['Result'], mx.inputs['Fac']); L.new(lo.outputs['Background'], mx.inputs[1]); L.new(hi.outputs['Background'], mx.inputs[2])
    # студийный купол виден только в отражениях полировки; рассеянный свет и «тень» на полу дают софтбоксы
    lp = N.new('ShaderNodeLightPath'); dark = N.new('ShaderNodeBackground')
    dark.inputs['Color'].default_value = (0.006, 0.006, 0.006, 1); dark.inputs['Strength'].default_value = 1
    m2 = N.new('ShaderNodeMixShader')
    L.new(lp.outputs['Is Glossy Ray'], m2.inputs['Fac']); L.new(dark.outputs['Background'], m2.inputs[1]); L.new(mx.outputs['Shader'], m2.inputs[2])
    L.new(m2.outputs['Shader'], out.inputs['Surface'])

def area(name, loc, size, energy, target=(0, 0, 0.15), color=(1, 1, 1), shape='RECTANGLE', sy=None):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    l.shape = shape
    if sy: l.size_y = sy
    o = bpy.data.objects.new(name, l); o.location = loc; bpy.context.collection.objects.link(o)
    d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o

def bounds():
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH' or ob.hide_render or ob.name == 'floor': continue
        ev = ob.evaluated_get(dg)
        for c in ev.bound_box:
            v = ob.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, v)); mx = Vector(map(max, mx, v))
    return mn, mx

def shoot(sc, code):
    mn, mx = bounds(); ctr = (mn + mx) / 2; ext = mx - mn
    # пол — ловец теней
    s0 = max(ext.x, ext.y, ext.z)
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, radius=max(6.0, 12 * s0), segments=96)
    bmesh.ops.translate(bm, vec=(ctr.x, ctr.y, mn.z), verts=bm.verts)
    fl = obj_from_bm(bm, 'floor'); fl.is_shadow_catcher = True; fl.visible_glossy = False
    # свет: большой софтбокс слева-сверху, заполняющий справа, контровой сзади, «потолок» для бликов полировки
    s = max(ext.x, ext.y, ext.z)
    area('key', (-1.1 * s - 0.4, -1.0 * s - 0.4, 2.6 * s + 0.9), 1.8 * s + 0.7, 300 * (s + 0.3) ** 2, tuple(ctr))
    area('fill', (1.8 * s + 0.6, -1.0 * s - 0.4, 0.9 * s + 0.3), 1.4 * s + 0.5, 90 * (s + 0.3) ** 2, tuple(ctr))
    area('rim', (0.4 * s, 1.8 * s + 0.6, 1.4 * s + 0.4), 0.5 * s + 0.2, 160 * (s + 0.3) ** 2, tuple(ctr), shape='RECTANGLE', sy=2.2 * s + 0.6)
    area('top', (0, -0.2 * s, 2.6 * s + 0.8), 1.2 * s + 0.4, 70 * (s + 0.3) ** 2, tuple(ctr))
    # камера: три четверти, чуть сверху
    cam = bpy.data.cameras.new('cam'); cam.lens = 85; cam.sensor_width = 36
    co = bpy.data.objects.new('cam', cam); bpy.context.collection.objects.link(co); sc.camera = co
    az, el = math.radians(-32), math.radians(16)
    W, H = (ext.x * 0.95 + ext.y * 0.55), (ext.z + ext.y * 0.35)
    aspect = max(0.62, min(1.6, W / H))
    if aspect >= 1: rx, ry = LONG, int(LONG / aspect)
    else: rx, ry = int(LONG * aspect), LONG
    sc.render.resolution_x, sc.render.resolution_y = rx, ry; sc.render.resolution_percentage = 100
    fov_h = 2 * math.atan(cam.sensor_width / (2 * cam.lens)); fov_v = 2 * math.atan(math.tan(fov_h / 2) * ry / rx) if rx >= ry else fov_h
    if rx < ry:
        cam.sensor_fit = 'VERTICAL'; cam.sensor_height = 36; fov_v = 2 * math.atan(18 / cam.lens); fov_h = 2 * math.atan(math.tan(fov_v / 2) * rx / ry)
    R = ext.length / 2
    dist = max(R / math.tan(fov_h / 2), R / math.tan(fov_v / 2)) * 1.08
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    co.location = ctr + d * dist
    co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, code + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', code, rx, ry, flush=True)

for code, fn, _ in MODELS:
    if ONLY and code not in ONLY: continue
    sc = reset(); world(sc)
    M = {
        'g': granite(),
        'glass': simple('glass', (0.95, 0.97, 1.0), 0.02, 0, None, 0, transmission=1.0),
        'wax': simple('wax', (0.92, 0.88, 0.8), 0.45, 0, (1.0, 0.72, 0.42), 0.6),
        'flame': simple('flame', (1.0, 0.7, 0.3), 0.5, 0, (1.0, 0.58, 0.2), 38.0),
        'brass': simple('brass', (0.78, 0.58, 0.3), 0.22, 1.0),
        'gravel': simple('gravel', (0.86, 0.86, 0.84), 0.6),
    }
    fn(M)
    shoot(sc, code)
