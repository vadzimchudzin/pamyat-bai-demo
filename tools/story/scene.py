# ПАМЯТЬ.БАЙ — «От разметки до сдачи»: процедурная сцена Blender (Cycles) для покадрового ролика по скроллу.
# Камера и свет совпадают с фоновой фотографией (plate): камера решена по фото, солнце — по тени колышка.
# Каждый кадр — состояние сцены как функция номера кадра (без ключей анимации): плавные перекрывающиеся движения.
# Рендерится только изменившаяся часть кадра (border), с запасом под тени, отражения и контекст денойзера;
# сборка (assemble.py) накладывает куски на предыдущий кадр и делает дельта-кадры для сайта.
#   blender -b -P scene.py -- --frames 0-779 --out /tmp/r [--res 1920] [--spp 64] [--full 0,300] [--hdr file]
import bpy, bmesh, math, sys, os, json, time, argparse
import numpy as np
from mathutils import Vector, Matrix, Euler
from mathutils.kdtree import KDTree
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--frames', default='0')
ap.add_argument('--out', default='/tmp/story')
ap.add_argument('--res', type=int, default=1920)
ap.add_argument('--spp', type=int, default=64)
ap.add_argument('--full', default='')          # кадры, которые рендерим целиком (синхронизация)
ap.add_argument('--allfull', action='store_true')  # тест: каждый кадр целиком
ap.add_argument('--hdr', default='/data/scene/sunset_forest_2k.hdr')
ap.add_argument('--hdr-u', type=float, default=0.534)   # u самой яркой части неба в HDR — совмещаем с солнцем
ap.add_argument('--world', type=float, default=0.7)
ap.add_argument('--sun', type=float, default=4.2)
ap.add_argument('--wsat', type=float, default=0.85)
ap.add_argument('--threads', type=int, default=0)
ap.add_argument('--list', action='store_true')    # только вывести число кадров
ap.add_argument('--plan', default='')             # без рендера: оценка цены кадров и деление на N шардов → JSON-файл
ap.add_argument('--shards', type=int, default=20)
ap.add_argument('--dbg', default='')
ap.add_argument('--exec', default='')            # отладка: выполнить файл после построения сцены
ap.add_argument('--view', default='AgX')
ap.add_argument('--look', default='AgX - Medium High Contrast')
ap.add_argument('--exposure', type=float, default=-0.8)
A = ap.parse_args(argv)

# ---------------------------------------------------------------- таймлайн (кадры)
ROWS, COLS = 4, 5
TP = 0.602                      # шаг плитки (600 мм + шов 2 мм)
TROW = 44                       # проход шпателя по ряду (клей на весь ряд)
TLAY = 6                        # шаг укладки плиток ряда
TDROP = 15                      # опускание плитки
TTURN = 8                       # переход шпателя на следующий ряд
TPH = (COLS - 1) * TLAY + TDROP + 3      # укладка плиток ряда
RP = TROW + TPH                 # период ряда: клей → плитка
FADE = 5                        # появление/исчезновение предметов (кадров)
T = dict(
    stakes=4, cords=26, diag=56, diag_off=72,
    boards=78, cords_off=98, stakes_off=104,
    sand=118, rebarX=148, rebarY=162,
    hose_in=190, pour=196, pour_end=258, rule=232, rule_end=276, hose_out=258,
    dry=272, dry_end=306, form_off=292,
    curb=318, glue=350,
)
T['tiles_end'] = T['glue'] + ROWS * RP + 4
T['posts'] = T['tiles_end'] + 2
T['rails'] = T['posts'] + 24
T['beds'] = T['posts'] + 36
T['pedestal'] = T['beds'] + 22
T['steleL'] = T['pedestal'] + 12
T['steleR'] = T['steleL'] + 14
T['gravel'] = T['steleR'] + 50
T['vase'] = T['gravel'] + 18
T['end'] = T['vase'] + 26 + 14
NFR = T['end'] + 1
if A.list:
    print(json.dumps({'count': NFR, 'T': T})); sys.exit(0)

def clamp01(x): return 0.0 if x < 0 else 1.0 if x > 1 else x
def seg(f, a, b): return clamp01((f - a) / float(b - a))
def sm(t): t = clamp01(t); return t * t * (3 - 2 * t)
def smoother(t): t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10)
def eout(t): t = clamp01(t); return 1 - (1 - t) ** 3
def ein(t): t = clamp01(t); return t * t * t
def npsm(t): t = np.clip(t, 0, 1); return t * t * (3 - 2 * t)

# ---------------------------------------------------------------- сцена
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; cy = sc.cycles
cy.device = 'CPU'; cy.samples = A.spp
cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.015; cy.adaptive_min_samples = 16
cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'; cy.denoising_prefilter = 'ACCURATE'
cy.seed = 0; cy.use_animated_seed = False
cy.max_bounces = 8; cy.diffuse_bounces = 3; cy.glossy_bounces = 4; cy.transmission_bounces = 2
cy.transparent_max_bounces = 4; cy.volume_bounces = 0
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.blur_glossy = 0.4; cy.sample_clamp_indirect = 6.0
sc.render.use_persistent_data = True
if A.threads: sc.render.threads_mode = 'FIXED'; sc.render.threads = A.threads
RW = A.res; RH = RW * 9 // 16
sc.render.resolution_x = RW; sc.render.resolution_y = RH; sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.view_settings.view_transform = A.view; sc.view_settings.look = A.look if A.view == 'AgX' else 'None'
sc.view_settings.exposure = A.exposure
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.color_depth = '16'
sc.render.image_settings.compression = 15

cam = bpy.data.cameras.new('Cam'); cam.lens = 47.015; cam.sensor_width = 36; cam.sensor_fit = 'HORIZONTAL'
cam.clip_start = 0.05; cam.clip_end = 200
co = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(co); sc.camera = co
co.location = (0, 0, 1.6); co.rotation_euler = (math.radians(90 - 7.02), 0, 0)

w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
_sun_az = math.atan2(0.9399, -0.3415)                       # азимут солнца (как в фото-фоне)
_hdr_az = -(A.hdr_u - 0.5) * 2 * math.pi                     # азимут яркой части HDR (Cycles: u = 0.5 - atan2(y,x)/2π)
mp.inputs['Rotation'].default_value = (0, 0, _hdr_az - _sun_az)
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(A.hdr)
mn = nt.nodes.new('ShaderNodeVectorMath'); mn.operation = 'MINIMUM'; mn.inputs[1].default_value = (14, 14, 14)
bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = A.world
wo = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = A.wsat; hs.inputs['Value'].default_value = 1.0
nt.links.new(env.outputs['Color'], mn.inputs[0]); nt.links.new(mn.outputs['Vector'], hs.inputs['Color']); nt.links.new(hs.outputs['Color'], bg.inputs['Color'])
nt.links.new(bg.outputs[0], wo.inputs[0])
lp = nt.nodes.new('ShaderNodeLightPath'); ma = nt.nodes.new('ShaderNodeMath'); ma.operation = 'MULTIPLY_ADD'
ma.inputs[1].default_value = -A.world * 0.3; ma.inputs[2].default_value = A.world      # в отражениях окружение темнее
nt.links.new(lp.outputs['Is Glossy Ray'], ma.inputs[0]); nt.links.new(ma.outputs[0], bg.inputs['Strength'])

SUN_E = math.radians(28.7); hd = Vector((-0.3415, 0.9399, 0)).normalized()
SUN = Vector((hd.x * math.cos(SUN_E), hd.y * math.cos(SUN_E), math.sin(SUN_E)))   # направление НА солнце
sl = bpy.data.lights.new('Sun', 'SUN'); sl.energy = A.sun; sl.angle = math.radians(1.2); sl.color = (1.0, 0.86, 0.68)
so = bpy.data.objects.new('Sun', sl); sc.collection.objects.link(so)
so.rotation_euler = (-SUN).to_track_quat('-Z', 'Y').to_euler()

# ---------------------------------------------------------------- материалы
def _m(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes['Principled BSDF']

def mat_granite(name, polish=0.045, tint=(0.010, 0.010, 0.011), hi=(0.05, 0.05, 0.056), coat=0.2):
    m, n, l, p = _m(name)
    tc = n.new('ShaderNodeTexCoord')
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1400; nz.inputs['Detail'].default_value = 2
    cr = n.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].position = 0.52; cr.color_ramp.elements[0].color = (*tint, 1)
    cr.color_ramp.elements[1].position = 0.66; cr.color_ramp.elements[1].color = (*hi, 1)
    l.new(tc.outputs['Object'], nz.inputs['Vector']); l.new(nz.outputs['Fac'], cr.inputs['Fac']); l.new(cr.outputs['Color'], p.inputs['Base Color'])
    smn = n.new('ShaderNodeTexNoise'); smn.inputs['Scale'].default_value = 6; smn.inputs['Detail'].default_value = 6
    mr = n.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = polish * 0.6; mr.inputs['To Max'].default_value = polish * 1.8
    l.new(tc.outputs['Object'], smn.inputs['Vector']); l.new(smn.outputs['Fac'], mr.inputs['Value']); l.new(mr.outputs['Result'], p.inputs['Roughness'])
    p.inputs['IOR'].default_value = 1.56
    p.inputs['Coat Weight'].default_value = coat; p.inputs['Coat Roughness'].default_value = 0.015
    return m

def mat_simple(name, col, rough, metal=0.0, spec=0.5):
    m, n, l, p = _m(name)
    p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal; p.inputs['Specular IOR Level'].default_value = spec
    return m

def mat_noise(name, c0, c1, rough, scale=40.0, bump=0.0, bscale=400.0, metal=0.0, rough1=None, stretch=(1, 1, 1)):
    m, n, l, p = _m(name)
    tc = n.new('ShaderNodeTexCoord'); mpn = n.new('ShaderNodeMapping'); mpn.inputs['Scale'].default_value = stretch
    l.new(tc.outputs['Object'], mpn.inputs['Vector'])
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 8
    l.new(mpn.outputs['Vector'], nz.inputs['Vector'])
    cr = n.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (*c0, 1); cr.color_ramp.elements[1].color = (*c1, 1)
    cr.color_ramp.elements[0].position = 0.3; cr.color_ramp.elements[1].position = 0.7
    l.new(nz.outputs['Fac'], cr.inputs['Fac']); l.new(cr.outputs['Color'], p.inputs['Base Color'])
    if rough1 is None: p.inputs['Roughness'].default_value = rough
    else:
        mr = n.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = rough; mr.inputs['To Max'].default_value = rough1
        l.new(nz.outputs['Fac'], mr.inputs['Value']); l.new(mr.outputs['Result'], p.inputs['Roughness'])
    p.inputs['Metallic'].default_value = metal
    if bump > 0:
        bn = n.new('ShaderNodeTexNoise'); bn.inputs['Scale'].default_value = bscale; bn.inputs['Detail'].default_value = 4
        l.new(tc.outputs['Object'], bn.inputs['Vector'])
        bm_ = n.new('ShaderNodeBump'); bm_.inputs['Strength'].default_value = bump; bm_.inputs['Distance'].default_value = 0.002
        l.new(bn.outputs['Fac'], bm_.inputs['Height']); l.new(bm_.outputs['Normal'], p.inputs['Normal'])
    return m

def mat_wood(name, c0=(0.36, 0.25, 0.15), c1=(0.55, 0.41, 0.26)):
    # волокна вдоль локальной X: шум, растянутый вдоль длины доски, + полосы годичных колец
    m, n, l, p = _m(name)
    tc = n.new('ShaderNodeTexCoord'); mpn = n.new('ShaderNodeMapping'); mpn.inputs['Scale'].default_value = (0.08, 3.0, 3.0)
    l.new(tc.outputs['Object'], mpn.inputs['Vector'])
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 14; nz.inputs['Detail'].default_value = 10; nz.inputs['Distortion'].default_value = 0.6
    l.new(mpn.outputs['Vector'], nz.inputs['Vector'])
    wv = n.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'Z'
    wv.inputs['Scale'].default_value = 9; wv.inputs['Distortion'].default_value = 6; wv.inputs['Detail'].default_value = 3
    l.new(mpn.outputs['Vector'], wv.inputs['Vector'])
    mx = n.new('ShaderNodeMix'); mx.data_type = 'FLOAT'; mx.inputs['Factor'].default_value = 0.35
    l.new(nz.outputs['Fac'], mx.inputs['A']); l.new(wv.outputs['Fac'], mx.inputs['B'])
    cr = n.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (*c0, 1); cr.color_ramp.elements[1].color = (*c1, 1)
    cr.color_ramp.elements[0].position = 0.35; cr.color_ramp.elements[1].position = 0.65
    l.new(mx.outputs['Result'], cr.inputs['Fac']); l.new(cr.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.78; p.inputs['Specular IOR Level'].default_value = 0.35
    bn = n.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = 0.25; bn.inputs['Distance'].default_value = 0.001
    l.new(mx.outputs['Result'], bn.inputs['Height']); l.new(bn.outputs['Normal'], p.inputs['Normal'])
    return m

def mat_concrete(name):
    # сухость по кадру: узел Value «DryT» 0 → весь мокрый, 1.6 → весь сухой; высыхает пятнами (шум)
    m, n, l, p = _m(name)
    tc = n.new('ShaderNodeTexCoord')
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 38; nz.inputs['Detail'].default_value = 10
    l.new(tc.outputs['Object'], nz.inputs['Vector'])
    cr = n.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = (0.17, 0.163, 0.15, 1); cr.color_ramp.elements[1].color = (0.31, 0.30, 0.28, 1)
    cr.color_ramp.elements[0].position = 0.28; cr.color_ramp.elements[1].position = 0.74
    l.new(nz.outputs['Fac'], cr.inputs['Fac'])
    dn = n.new('ShaderNodeTexNoise'); dn.inputs['Scale'].default_value = 2.2; dn.inputs['Detail'].default_value = 5
    l.new(tc.outputs['Object'], dn.inputs['Vector'])
    dt = n.new('ShaderNodeValue'); dt.name = 'DryT'; dt.outputs[0].default_value = 0.0
    sub = n.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; l.new(dt.outputs[0], sub.inputs[0]); l.new(dn.outputs['Fac'], sub.inputs[1])
    wet = n.new('ShaderNodeMapRange'); wet.inputs['From Min'].default_value = -0.15; wet.inputs['From Max'].default_value = 0.25
    wet.inputs['To Min'].default_value = 1.0; wet.inputs['To Max'].default_value = 0.0
    l.new(sub.outputs[0], wet.inputs['Value'])
    dark = n.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MULTIPLY'
    dark.inputs['B'].default_value = (0.60, 0.60, 0.61, 1)
    l.new(wet.outputs['Result'], dark.inputs['Factor']); l.new(cr.outputs['Color'], dark.inputs['A'])
    l.new(dark.outputs['Result'], p.inputs['Base Color'])
    rr = n.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = 0.88; rr.inputs['To Max'].default_value = 0.40
    l.new(wet.outputs['Result'], rr.inputs['Value']); l.new(rr.outputs['Result'], p.inputs['Roughness'])
    bn = n.new('ShaderNodeTexNoise'); bn.inputs['Scale'].default_value = 260; bn.inputs['Detail'].default_value = 6
    l.new(tc.outputs['Object'], bn.inputs['Vector'])
    bs = n.new('ShaderNodeMapRange'); bs.inputs['To Min'].default_value = 0.35; bs.inputs['To Max'].default_value = 0.14
    l.new(wet.outputs['Result'], bs.inputs['Value'])
    bm_ = n.new('ShaderNodeBump'); bm_.inputs['Distance'].default_value = 0.002
    l.new(bs.outputs['Result'], bm_.inputs['Strength']); l.new(bn.outputs['Fac'], bm_.inputs['Height']); l.new(bm_.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Specular IOR Level'].default_value = 0.5
    return m, dt

def mat_attr(name, rough=0.45):
    m, n, l, p = _m(name)
    at = n.new('ShaderNodeAttribute'); at.attribute_name = 'Col'
    l.new(at.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = rough
    return m

G = mat_granite('Granite')
GS = mat_granite('GraniteSawn', polish=0.16, coat=0.0)
WOOD = mat_wood('Wood', (0.40, 0.24, 0.11), (0.62, 0.42, 0.22)); WOOD2 = mat_wood('Wood2', (0.33, 0.19, 0.09), (0.52, 0.34, 0.17))
CORD = mat_simple('Cord', (0.95, 0.33, 0.02), 0.55)
PAINT = mat_simple('Paint', (0.85, 0.10, 0.04), 0.45)
SAND = mat_noise('Sand', (0.36, 0.235, 0.15), (0.50, 0.34, 0.22), 0.95, scale=60, bump=0.45, bscale=900)
REBAR = mat_noise('Rebar', (0.075, 0.042, 0.026), (0.19, 0.085, 0.04), 0.55, scale=30, metal=0.45, rough1=0.85, bump=0.5, bscale=300)
CONC, CONC_DRY = mat_concrete('Concrete')
STREAM = mat_simple('Stream', (0.13, 0.13, 0.13), 0.12)
RUBBER = mat_noise('Rubber', (0.012, 0.012, 0.013), (0.03, 0.03, 0.032), 0.42, scale=80)
STEEL = mat_simple('Steel', (0.72, 0.73, 0.75), 0.22, metal=1.0)
ALU = mat_noise('Alu', (0.78, 0.79, 0.81), (0.88, 0.89, 0.9), 0.25, scale=6, metal=1.0, rough1=0.38, stretch=(0.05, 1, 1))
HANDLE = mat_simple('Handle', (0.55, 0.06, 0.03), 0.38)
GLUE = mat_noise('Glue', (0.63, 0.625, 0.60), (0.74, 0.735, 0.71), 0.72, scale=35, bump=0.2, bscale=500, rough1=0.88)
GRAVEL = mat_attr('Gravel', 0.42)
PETAL = mat_noise('Petal', (0.42, 0.012, 0.025), (0.62, 0.03, 0.05), 0.5, scale=90)
LEAF = mat_simple('Leaf', (0.035, 0.16, 0.03), 0.5)

# ---------------------------------------------------------------- геометрия
PLOT = bpy.data.objects.new('PLOT', None); sc.collection.objects.link(PLOT)
PLOT.location = (0.32, 6.45, 0); PLOT.rotation_euler = (0, 0, -0.30)
bpy.context.view_layer.update()
PM = PLOT.matrix_world.copy()

def link(ob):
    sc.collection.objects.link(ob); ob.parent = PLOT; return ob

def bevel(ob, w=0.003, seg=2, ang=40):
    b = ob.modifiers.new('bev', 'BEVEL'); b.width = w; b.segments = seg; b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(ang); b.harden_normals = False
    return b

def shade_smooth_angle(me, ang=35):
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    try:
        me.set_sharp_from_angle(angle=math.radians(ang))
    except Exception:
        pass

def mesh_from(name, verts, faces, mats, mat_idx=None, smooth=False, ang=35):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    for m in mats: me.materials.append(m)
    if mat_idx is not None: me.polygons.foreach_set('material_index', mat_idx)
    me.validate(); me.update()
    if smooth: shade_smooth_angle(me, ang)
    return me

def bm_box(bm, sx, sy, sz, cx=0, cy=0, z0=0, mat=0):
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']: v.co = Vector((v.co.x * sx + cx, v.co.y * sy + cy, v.co.z * sz + z0 + sz / 2))
    for f in {f for v in r['verts'] for f in v.link_faces}: f.material_index = mat
    return r

def obj_bm(name, build, mats, bw=0.0, seg=2, smooth=True, ang=35, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); build(bm); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    if smooth: shade_smooth_angle(me, ang)
    ob = bpy.data.objects.new(name, me); link(ob); ob.location = loc
    if bw: bevel(ob, bw, seg)
    return ob

def box(name, sx, sy, sz, mat, loc, bw=0.003, seg=2):
    # начало координат — центр низа
    return obj_bm(name, lambda bm: bm_box(bm, sx, sy, sz), [mat], bw=bw, seg=seg, loc=loc)

def extrude_profile(bm, pts, t, y0=0.0, mat=0):
    # pts — контур (x, z) против часовой; выдавливание по y от y0 - t/2 до y0 + t/2
    fv = [bm.verts.new((x, y0 - t / 2, z)) for x, z in pts]; bv = [bm.verts.new((x, y0 + t / 2, z)) for x, z in pts]
    n = len(pts); faces = []
    faces.append(bm.faces.new(fv[::-1])); faces.append(bm.faces.new(bv))
    for i in range(n):
        j = (i + 1) % n; faces.append(bm.faces.new((fv[i], fv[j], bv[j], bv[i])))
    for f in faces: f.material_index = mat
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces

# --- размеры (м, локально к участку: X — ширина, Y — глубина от камеры, Z — вверх)
SX, SY = 1.6, 1.3               # полуразмеры плиты
Z_SAND, Z_TOP = 0.04, 0.10      # песок, верх бетона
CURB_W, CURB_H = 0.08, 0.06
Z_GLUE = Z_TOP + 0.006; Z_TILE0 = Z_TOP + 0.004; TILE_T = 0.02; Z_TILE = Z_TILE0 + TILE_T
TX, TY = 2.5 * TP, 2.0 * TP     # полуразмеры поля плитки (1.505 × 1.204)

items = []          # анимируемые элементы: функция(f) -> (сигнатура, точки области изменения в мире)
def item(fn): items.append(fn); return fn

def wbox(ob, pad=0.0):
    # 8 углов габарита объекта в мировых координатах
    M = ob.matrix_world; bb = [Vector(c) for c in ob.bound_box]
    lo = Vector((min(c.x for c in bb) - pad, min(c.y for c in bb) - pad, min(c.z for c in bb) - pad))
    hi = Vector((max(c.x for c in bb) + pad, max(c.y for c in bb) + pad, max(c.z for c in bb) + pad))
    return [M @ Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]

def wbox_split(ob, pad=0.0, seg_len=0.45):
    # габарит объекта; длинные предметы (доски, бордюры, правило, арматура, стелы) — кусками по длинной оси:
    # их наклонные в кадре проекции и тени покрываются плотнее
    M = ob.matrix_world; bb = [Vector(c) for c in ob.bound_box]
    lo = Vector((min(c.x for c in bb) - pad, min(c.y for c in bb) - pad, min(c.z for c in bb) - pad))
    hi = Vector((max(c.x for c in bb) + pad, max(c.y for c in bb) + pad, max(c.z for c in bb) + pad))
    M3 = M.to_3x3()
    ext = [(M3 @ Vector([hi[i] - lo[i] if j == i else 0.0 for j in range(3)])).length for i in range(3)]
    ax = max(range(3), key=lambda i: ext[i]); k = int(math.ceil(ext[ax] / seg_len - 0.15))
    corners = lambda a, b: [M @ Vector((x, y, z)) for x in (a.x, b.x) for y in (a.y, b.y) for z in (a.z, b.z)]
    if k <= 1: return corners(lo, hi)
    G = []
    for i in range(k):
        a = lo.copy(); b = hi.copy()
        a[ax] = lo[ax] + (hi[ax] - lo[ax]) * i / k; b[ax] = lo[ax] + (hi[ax] - lo[ax]) * (i + 1) / k
        G.append(corners(a, b))
    return {'groups': G}

def lbox(x0, x1, y0, y1, z0, z1):
    return [PM @ Vector((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]

def rigid(ob, pose_fn, pad=0.01):
    # pose_fn(f) -> (видим, смещение (dx,dy,dz), поворот (rx,ry,rz)) относительно положения покоя
    rest = ob.location.copy(); rrest = ob.rotation_euler.copy()
    def fn(f):
        res = pose_fn(f)
        vis, d, r = res[:3]; al = res[3] if len(res) > 3 else 1.0
        vis = vis and al > 0.002
        ob.hide_render = not vis
        ob.location = rest + Vector(d); ob.rotation_euler = Euler((rrest.x + r[0], rrest.y + r[1], rrest.z + r[2]))
        ob.color = (1, 1, 1, al)
        sig = (vis,) + tuple(round(v, 5) for v in d) + tuple(round(v, 5) for v in r) + (round(al, 3),) if vis else (False,)
        return sig, (lambda: wbox_split(ob, pad)) if vis else (lambda: [])
    return item(fn)

def drop(f, f0, dur, h=0.35, f_out=None, out_dur=12, out_h=0.9, tilt=(0.0, 0.0), out_dir=(0, 0)):
    # опускание сверху с мягкой посадкой; после f_out — подъём и уход
    if f < f0: return False, (0, 0, 0), (0, 0, 0), 0.0
    t = seg(f, f0, f0 + dur); e = eout(t)
    dz = h * (1 - e); k = (1 - e)
    rot = (tilt[0] * k, tilt[1] * k, 0)
    d = [0.0, 0.0, dz]; al = sm(seg(f, f0 - 1, f0 + FADE))
    if f_out is not None and f >= f_out:
        u = ein(seg(f, f_out, f_out + out_dur))
        if u >= 1: return False, (0, 0, 0), (0, 0, 0), 0.0
        d = [out_dir[0] * u, out_dir[1] * u, out_h * u]
        al = min(al, 1 - sm(seg(f, f_out + out_dur - FADE, f_out + out_dur)))
    return True, tuple(d), rot, al

# ================================================================ 1. Разметка: колышки и шнур
STK = [(-SX - 0.10, -SY - 0.10), (SX + 0.10, -SY - 0.10), (SX + 0.10, SY + 0.10), (-SX - 0.10, SY + 0.10)]
ORDER = [3, 2, 1, 0]     # с дальнего левого по часовой
stakes = []
for k, (x, y) in enumerate(STK):
    def build(bm):
        bm_box(bm, 0.03, 0.03, 0.62, z0=-0.2, mat=0); bm_box(bm, 0.032, 0.032, 0.05, z0=0.37, mat=1)
    ob = obj_bm('Stake%d' % k, build, [WOOD, PAINT], bw=0.002, loc=(x, y, 0))
    stakes.append(ob)
    j = ORDER.index(k)
    f0 = T['stakes'] + 6 * j
    rigid(ob, (lambda f0: lambda f: drop(f, f0, 14, h=0.30, f_out=T['stakes_off'] + 2 * (k % 2), out_dur=10, out_h=0.6))(f0))

CORD_Z = 0.08
def cord_obj(name):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.0025, radius2=0.0025, depth=1.0)
    for v in bm.verts: v.co.z += 0.5
    bm.to_mesh(me); bm.free(); me.materials.append(CORD)
    ob = bpy.data.objects.new(name, me); link(ob); return ob

def cord_item(ob, a, b, f0, dur, f_off, off_dur=8):
    A_ = Vector((a[0], a[1], CORD_Z)); B_ = Vector((b[0], b[1], CORD_Z)); L = (B_ - A_).length
    q = (B_ - A_).normalized().to_track_quat('Z', 'Y')
    ob.location = A_; ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = q
    gf = lambda f: sm(seg(f, f0, f0 + dur)) * (1 - sm(seg(f, f_off, f_off + off_dur)))
    def fn(f):
        g = gf(f); gp = gf(f - 1)
        vis = g > 0.002
        ob.hide_render = not vis
        ob.scale = (1, 1, max(g, 1e-4) * L)
        sig = (vis, round(g, 4)) if vis else (False,)
        # меняется только кусок шнура между прошлым и новым концом (при снятии — тоже)
        u0, u1 = min(g, gp), max(g, gp)
        if f >= f_off: u0 = 0.0 if g < 0.01 else u0
        P0 = (a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0); P1 = (a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1)
        box_ = lambda: lbox(min(P0[0], P1[0]) - 0.04, max(P0[0], P1[0]) + 0.04, min(P0[1], P1[1]) - 0.04, max(P0[1], P1[1]) + 0.04, 0, 0.12)
        return sig, box_ if (vis or gp > 0.002) else (lambda: [])
    item(fn)

for j in range(4):
    a = STK[ORDER[j]]; b = STK[ORDER[(j + 1) % 4]]
    cord_item(cord_obj('Cord%d' % j), a, b, T['cords'] + 8 * j, 14, T['cords_off'] + 2 * j)
cord_item(cord_obj('Diag0'), STK[3], STK[1], T['diag'], 12, T['diag_off'])
cord_item(cord_obj('Diag1'), STK[2], STK[0], T['diag'] + 4, 12, T['diag_off'] + 2)

# ================================================================ 2. Опалубка, песок, арматура
BT, BH, BZ = 0.025, 0.16, -0.06     # доска: толщина, высота, низ (верх = Z_TOP)
boards = []
def board(name, length, cx, cy, rotz, outward, f0, idx):
    def build(bm):
        bm_box(bm, length, BT, BH, z0=BZ)
        # колья снаружи доски
        n = max(2, int(length / 0.9) + 1)
        for i in range(n):
            x = -length / 2 + 0.12 + (length - 0.24) * i / (n - 1)
            bm_box(bm, 0.04, 0.04, 0.30, cx=x, cy=-(BT / 2 + 0.02), z0=-0.12)
    ob = obj_bm(name, build, [WOOD if idx % 2 == 0 else WOOD2], bw=0.002, loc=(cx, cy, 0))
    ob.rotation_euler = (0, 0, rotz)
    fo = T['form_off'] + 4 * idx
    out = Vector(outward)
    def pose(f):
        if f < f0: return False, (0, 0, 0), (0, 0, 0), 0.0
        e = eout(seg(f, f0, f0 + 18)); d = [0, 0, 0.28 * (1 - e)]; r = (0, 0, 0); al = sm(seg(f, f0 - 1, f0 + FADE))
        if f >= fo:
            u = ein(seg(f, fo, fo + 16))
            if u >= 1: return False, (0, 0, 0), (0, 0, 0), 0.0
            d = [out.x * 0.25 * u, out.y * 0.25 * u, 0.5 * u]; al = 1 - sm(seg(f, fo + 16 - FADE, fo + 16))
        return True, tuple(d), r, al
    rigid(ob, pose); boards.append(ob)
    return ob

L_FB = 2 * SX + 2 * BT + 0.10
board('BoardBack', L_FB, 0, SY + 0.001 + BT / 2, math.pi, (0, 1), T['boards'], 0)        # колья наружу (+Y)
board('BoardLeft', 2 * SY + 0.002, -SX - 0.001 - BT / 2, 0, -math.pi / 2, (-1, 0), T['boards'] + 7, 1)
board('BoardRight', 2 * SY + 0.002, SX + 0.001 + BT / 2, 0, math.pi / 2, (1, 0), T['boards'] + 14, 2)
board('BoardFront', L_FB, 0, -SY - 0.001 - BT / 2, 0, (0, -1), T['boards'] + 21, 3)

def grid(nx, ny, x0, x1, y0, y1):
    xs = np.linspace(x0, x1, nx); ys = np.linspace(y0, y1, ny)
    X, Y = np.meshgrid(xs, ys)          # [ny, nx]
    idx = np.arange(nx * ny).reshape(ny, nx)
    a = idx[:-1, :-1].ravel(); b = idx[:-1, 1:].ravel(); c = idx[1:, 1:].ravel(); d = idx[1:, :-1].ravel()
    faces = np.stack([a, b, c, d], 1)
    return X, Y, faces

def smooth_noise(X, Y, seed, n=7, fmin=1.5, fmax=9.0):
    rng = np.random.default_rng(seed); out = np.zeros_like(X)
    for i in range(n):
        fq = fmin * (fmax / fmin) ** (i / max(1, n - 1)); ang = rng.uniform(0, math.pi); ph = rng.uniform(0, 2 * math.pi)
        out += np.sin((X * math.cos(ang) + Y * math.sin(ang)) * fq * 2 * math.pi + ph) / (1 + i * 0.6)
    return out / np.abs(out).max()

def rand_field(shape, sigma, seed):
    # гладкое случайное поле (без регулярного узора синусов): белый шум, сглаженный гауссом (σ в ячейках сетки)
    z = np.random.default_rng(seed).normal(size=shape)
    ky = np.fft.fftfreq(shape[0])[:, None]; kx = np.fft.fftfreq(shape[1])[None, :]
    out = np.real(np.fft.ifft2(np.fft.fft2(z) * np.exp(-2 * math.pi ** 2 * sigma ** 2 * (kx ** 2 + ky ** 2))))
    return out / np.abs(out).max()

class Height:
    """Сетка-высота (песок, бетон, клей, щебень): z пересчитывается на кадр, топология постоянна."""
    def __init__(self, name, X, Y, faces, mats, skirt=False, colors=None):
        self.X = X.ravel(); self.Y = Y.ravel(); self.n = self.X.size; self.ny, self.nx = X.shape
        verts = np.stack([self.X, self.Y, np.zeros(self.n)], 1)
        fl = faces.tolist()
        self.ring = None
        if skirt:
            ny, nx = X.shape; idx = np.arange(nx * ny).reshape(ny, nx)
            ring = list(idx[0, :]) + list(idx[1:, -1]) + list(idx[-1, -2::-1]) + list(idx[-2:0:-1, 0])
            self.ring = np.array(ring)
            base = self.n; extra = np.stack([self.X[self.ring], self.Y[self.ring], np.zeros(len(ring))], 1)
            verts = np.vstack([verts, extra])
            m = len(ring)
            for i in range(m):
                j = (i + 1) % m
                fl.append((ring[j], ring[i], base + i, base + j))
        me = bpy.data.meshes.new(name); me.from_pydata(verts.tolist(), [], fl)
        for m_ in mats: me.materials.append(m_)
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        if colors is not None:
            ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
            cc = np.ones((len(me.vertices), 4), np.float32); cc[:self.n, :3] = colors
            if skirt: cc[self.n:, :3] = colors[self.ring]
            ca.data.foreach_set('color', cc.ravel())
        me.validate(); me.update()
        self.me = me; self.ob = bpy.data.objects.new(name, me); link(self.ob)
        self.nv = len(me.vertices); self.co = verts.astype(np.float32).copy()
        self.last = None; self.chg = None
    def box(self, pad=0.03, extra_z=0.0, bands=6):
        # мировые точки области, изменившейся при последнем set() (с запасом на соседние грани); полосами по Y
        if self.chg is None: return []
        M = self.ob.matrix_world; G = []
        for (x0, x1, y0, y1, z0, z1) in self.chgb:
            G.append([M @ Vector((x, y, z)) for x in (x0 - pad, x1 + pad) for y in (y0 - pad, y1 + pad) for z in (z0, z1 + extra_z)])
        return {'groups': G, 'delta': True}      # рамки уже включают и старое, и новое положение вершин
    def set(self, Z, Xc=None):
        co = self.co
        oX = co[:self.n, 0].copy(); oZ = co[:self.n, 2].copy()
        if Xc is not None: co[:self.n, 0] = Xc
        co[:self.n, 2] = Z
        ch = (np.abs(co[:self.n, 2] - oZ) > 2e-5) | (np.abs(co[:self.n, 0] - oX) > 2e-5)
        if ch.any():
            xs = np.concatenate([co[:self.n, 0][ch], oX[ch]]); ys = self.Y[ch]; zs = np.concatenate([co[:self.n, 2][ch], oZ[ch]])
            self.chg = (float(xs.min()), float(xs.max()), float(ys.min()), float(ys.max()), float(min(0.0, zs.min())), float(zs.max()))
            # полосы по Y: фронт растекания/засыпки обычно наклонный — несколько узких рамок дешевле одной большой
            yb = np.linspace(self.chg[2], self.chg[3] + 1e-6, 7); self.chgb = []
            nX, nZ = co[:self.n, 0][ch], co[:self.n, 2][ch]; oXc, oZc = oX[ch], oZ[ch]
            for i in range(6):
                m_ = (ys >= yb[i]) & (ys < yb[i + 1])
                if not m_.any(): continue
                xx = np.concatenate([nX[m_], oXc[m_]]); zz = np.concatenate([nZ[m_], oZc[m_]])
                self.chgb.append((float(xx.min()), float(xx.max()), float(ys[m_].min()), float(ys[m_].max()), float(min(0.0, zz.min())), float(zz.max())))
        else: self.chg = None; self.chgb = []
        if self.ring is not None:
            co[self.n:, 0] = co[self.ring, 0]; co[self.n:, 2] = 0.0
        self.me.vertices.foreach_set('co', co.ravel()); self.me.update()

# --- песок
sX, sY, sF = grid(97, 79, -SX + 0.002, SX - 0.002, -SY + 0.002, SY - 0.002)
SANDH = Height('SandBed', sX, sY, sF, [SAND])
sN = smooth_noise(sX, sY, 3, fmin=1.0, fmax=6.0).ravel()
sPhi = (((sX.ravel() + SX) * 0.6 + (SY - sY.ravel())) / (2 * SX * 0.6 + 2 * SY)) + 0.08 * sN    # засыпаем от дальнего левого угла
@item
def sand_fn(f):
    t0, t1 = T['sand'], T['sand'] + 26
    vis = T['sand'] <= f < T['pour_end'] + 4
    SANDH.ob.hide_render = not vis
    if not vis: return (False,), (lambda: [])
    p = seg(f, t0, t1); lev = sm(seg(f, t1 - 6, t1 + 10))
    if SANDH.last != (round(p, 4), round(lev, 4)):
        h = npsm((p * 1.35 - sPhi) / 0.25)
        Z = h * (Z_SAND + (0.012 * sN + 0.006 * np.sin(sX.ravel() * 31) * np.sin(sY.ravel() * 27)) * (1 - lev)) - 0.001
        SANDH.set(Z); SANDH.last = (round(p, 4), round(lev, 4))
    return (True, round(p, 4), round(lev, 4)), (lambda: SANDH.box(0.03, 0.01))

# --- арматура Ø10, сетка 200 мм
RZ = 0.062
def bar(name, length, along_x, pos, f0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.0055, radius2=0.0055, depth=length)
    bm.to_mesh(me); bm.free(); me.materials.append(REBAR)
    shade_smooth_angle(me, 60)
    ob = bpy.data.objects.new(name, me); link(ob)
    if along_x: ob.rotation_euler = (0, math.pi / 2, 0); ob.location = (0, pos, RZ)
    else: ob.rotation_euler = (math.pi / 2, 0, 0); ob.location = (pos, 0, RZ + 0.011)
    rigid(ob, lambda f: (drop(f, f0, 12, h=0.20, tilt=(0.0, 0.05))[0] and f < T['pour_end'] + 2,) + drop(f, f0, 12, h=0.20, tilt=(0.0, 0.05))[1:], pad=0.006)
ys = np.arange(-SY + 0.1, SY - 0.05, 0.2)
for i, y in enumerate(ys): bar('BarX%d' % i, 2 * SX - 0.1, True, float(y), T['rebarX'] + i * 1.3)
xs = np.arange(-SX + 0.1, SX - 0.05, 0.2)
for i, x in enumerate(xs): bar('BarY%d' % i, 2 * SY - 0.1, False, float(x), T['rebarY'] + i * 1.1)

# ================================================================ 3. Бетон: шланг, заливка, правило, высыхание
cX, cY, cF = grid(161, 131, -SX, SX, -SY, SY)
CONCH = Height('Concrete', cX, cY, cF, [CONC], skirt=True)
cx_, cy_ = cX.ravel(), cY.ravel()
cN = (0.7 * rand_field(cX.shape, 9.0, 7) + 0.3 * rand_field(cX.shape, 4.0, 8)).ravel()   # кучи от заливки (шаг сетки 2 см)
cN2 = rand_field(cX.shape, 1.6, 11).ravel()                                             # мелкие комки
# путь носика шланга: змейкой от дальнего края к ближнему
P0, P1 = T['pour'], T['pour_end'] - 10
path_t = np.linspace(P0, P1, 240)
u = (path_t - P0) / (P1 - P0)
lanes = 4
lane = np.minimum(np.floor(u * lanes), lanes - 1); fr = u * lanes - lane
px_ = np.where(lane % 2 == 0, -SX + 0.35 + fr * (2 * SX - 0.7), SX - 0.35 - fr * (2 * SX - 0.7))
py_ = SY - 0.32 - lane * ((2 * SY - 0.64) / (lanes - 1))
def nozzle_xy(f):
    t = np.clip(f, P0, P1); return float(np.interp(t, path_t, px_)), float(np.interp(t, path_t, py_))
V_SPREAD = 0.045    # м за кадр
best = np.full(cx_.size, 1e9)
for k in range(0, path_t.size, 2):
    d = np.hypot(cx_ - px_[k], cy_ - py_[k])
    best = np.minimum(best, path_t[k] + d / V_SPREAD)
cPhi = best + 3.0 * cN2
R0, R1 = T['rule'], T['rule_end']
def rule_y(f):
    return SY + 0.06 - (2 * SY + 0.12) * smoother(seg(f, R0, R1))
@item
def concrete_fn(f):
    vis = f >= T['pour']
    CONCH.ob.hide_render = not vis
    dry = 1.6 * smoother(seg(f, T['dry'], T['dry_end']))
    CONC_DRY.outputs[0].default_value = dry
    if not vis: return (False,), (lambda: [])
    ry = rule_y(f); key = (round(min(f, T['rule_end'] + 1), 3), round(dry, 4))
    dry_changed = CONCH.last is None or CONCH.last[1] != key[1]
    if CONCH.last != key:
        h = npsm((f - cPhi) / 5.0)
        scr = npsm((cy_ - ry) / 0.05) * (1.0 if f >= R0 else 0.0)      # за правилом — ровно
        lump = (0.012 * cN + 0.0045 * cN2) * (1 - scr)
        heap = 0.010 * np.exp(-((ry - cy_ - 0.05) / 0.05) ** 2) * (cy_ < ry) * (R0 <= f < R1) * h
        Z = Z_SAND - 0.002 + h * (Z_TOP - Z_SAND + 0.002 + lump) + heap
        Z = np.where(scr > 0.98, Z_TOP, Z)
        CONCH.set(Z); CONCH.last = key
    changing = f <= max(T['pour_end'], T['rule_end']) + 1 or T['dry'] <= f <= T['dry_end'] + 1
    whole = lambda: lbox(-SX - 0.02, SX + 0.02, -SY - 0.02, SY + 0.02, 0, Z_TOP + 0.04)
    return (True,) + key, (whole if dry_changed else (lambda: CONCH.box(0.04, 0.02)))

# шланг бетононасоса (кривая) и струя бетона
hc = bpy.data.curves.new('Hose', 'CURVE'); hc.dimensions = '3D'; hc.bevel_depth = 0.055; hc.bevel_resolution = 4
hc.resolution_u = 24
spl = hc.splines.new('BEZIER'); spl.bezier_points.add(2)
HOSE = bpy.data.objects.new('Hose', hc); link(HOSE); hc.materials.append(RUBBER)
HOSE.visible_shadow = False          # тонкий шланг без тени (тень носика и струи остаётся)
ring_me = bpy.data.meshes.new('Nozzle'); bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=24, radius1=0.062, radius2=0.062, depth=0.12); bm.to_mesh(ring_me); bm.free()
ring_me.materials.append(STEEL); NOZ = bpy.data.objects.new('Nozzle', ring_me); link(NOZ)
st_me = bpy.data.meshes.new('Stream'); bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=False, segments=16, radius1=0.035, radius2=0.045, depth=1.0)
for v in bm.verts: v.co.z -= 0.5
bm.to_mesh(st_me); bm.free(); st_me.materials.append(STREAM)
STRM = bpy.data.objects.new('Stream', st_me); link(STRM)
HOSE_UP = Vector((0.30, 0.55, 2.9))     # шланг бетононасоса свисает со стрелы (за верхним краем кадра)
@item
def hose_fn(f):
    a_in = eout(seg(f, T['hose_in'], T['hose_in'] + 12)); a_out = ein(seg(f, T['hose_out'], T['hose_out'] + 14))
    vis = f >= T['hose_in'] and a_out < 1
    al = sm(seg(f, T['hose_in'] - 1, T['hose_in'] + FADE)) * (1 - sm(seg(f, T['hose_out'] + 14 - FADE, T['hose_out'] + 14)))
    for o in (HOSE, NOZ): o.hide_render = not vis; o.color = (1, 1, 1, al)
    if not vis:
        STRM.hide_render = True; return (False,), (lambda: [])
    nx, ny = nozzle_xy(f)
    lift = 1.6 * (1 - a_in) + 1.8 * a_out
    tip = Vector((nx + 0.3 * (1 - a_in) + 0.3 * a_out, ny + 0.3 * a_out, 0.42 + lift))
    sw = 0.035 * math.sin(f * 0.23)                     # лёгкое покачивание
    mid = tip + Vector((0.05 + sw, 0.12, 1.05))
    top = tip + HOSE_UP
    pts = spl.bezier_points
    for p_, v in zip(pts, [top, mid, tip + Vector((0, 0, 0.06))]):
        p_.co = v; p_.handle_left_type = p_.handle_right_type = 'AUTO'
    NOZ.location = tip; NOZ.rotation_euler = (0, 0, 0)
    pour_on = T['pour'] <= f <= T['pour_end'] - 6 and a_in > 0.95 and a_out == 0
    STRM.hide_render = not pour_on
    if pour_on:
        top_ = tip.z - 0.06; bot = Z_SAND + 0.02
        STRM.location = (nx, ny, top_); STRM.scale = (1, 1, max(0.01, top_ - bot)); STRM.rotation_euler = (0, 0, f * 0.7)
    sig = (True, round(nx, 4), round(ny, 4), round(lift, 4), round(sw, 4), pour_on, f if pour_on else 0, round(al, 3))
    def pts_fn():
        # носик + струя (с тенью) и шланг кусками по высоте (без тени) — узкие рамки вдоль шланга
        G = [[PM @ Vector((tip.x + dx, tip.y + dy, z)) for dx in (-0.12, 0.12) for dy in (-0.12, 0.12) for z in (0.0, tip.z + 0.1)]]
        dg = bpy.context.evaluated_depsgraph_get(); eo = HOSE.evaluated_get(dg); me_ = eo.to_mesh()
        V = np.empty(len(me_.vertices) * 3, np.float32); me_.vertices.foreach_get('co', V); eo.to_mesh_clear()
        V = V.reshape(-1, 3); M = np.array(HOSE.matrix_world, np.float32)
        V = V @ M[:3, :3].T + M[:3, 3]
        NS = []
        if len(V):
            zz = V[:, 2]; edges = np.linspace(zz.min(), zz.max() + 1e-4, 9)
            for k in range(8):
                c = V[(zz >= edges[k]) & (zz < edges[k + 1])]
                if not len(c): continue
                lo = c.min(0) - 0.02; hi = c.max(0) + 0.02
                NS.append([Vector((x, y, z)) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
        return {'groups': G, 'ns': NS}
    return sig, pts_fn

# правило (алюминиевая рейка) — идёт по бортам опалубки от дальнего края к ближнему, с «пилящим» движением
RULE = box('Rule', 2 * SX + 0.30, 0.10, 0.022, ALU, (0, 0, Z_TOP), bw=0.002)
RULE.rotation_euler = (0, 0, 0)
@item
def rule_fn(f):
    a = sm(seg(f, R0 - 10, R0)); b = sm(seg(f, R1, R1 + 10))
    vis = R0 - 10 <= f <= R1 + 10
    RULE.hide_render = not vis
    if not vis: return (False,), (lambda: [])
    y = rule_y(f) - 0.05
    saw = 0.06 * math.sin((f - R0) * 0.9) * (1 if R0 <= f <= R1 else 0)
    RULE.location = (saw, y, Z_TOP + 0.35 * (1 - a) + 0.5 * b)
    RULE.rotation_euler = (0.35, 0, 0)     # чуть наклонено к себе — рабочая кромка снизу
    al = sm(seg(f, R0 - 11, R0 - 10 + FADE)) * (1 - sm(seg(f, R1 + 10 - FADE, R1 + 10)))
    RULE.color = (1, 1, 1, al); RULE.hide_render = al <= 0.002
    return (True, round(y, 4), round(saw, 4), round(a, 4), round(b, 4), round(al, 3)), (lambda: wbox_split(RULE, 0.02))

# ================================================================ 4. Бордюр, клей, плитка
CURBS = []
def curb(name, sx, sy, cx, cy, f0):
    ob = box(name, sx, sy, CURB_H, G, (cx, cy, Z_TOP), bw=0.003)
    rigid(ob, lambda f: drop(f, f0, 14, h=0.25, tilt=(0.03, -0.02))); CURBS.append(ob)
PX, PY = SX - 0.06, SY - 0.06          # центры столбов (12×12 см) по углам
cx0 = 0.06                              # пол-ширины среднего столба
curb('CurbB', 2 * (PX - 0.06), CURB_W, 0, SY - CURB_W / 2, T['curb'])
curb('CurbL', CURB_W, 2 * PY - 0.12, -SX + CURB_W / 2, 0, T['curb'] + 8)
curb('CurbR', CURB_W, 2 * PY - 0.12, SX - CURB_W / 2, 0, T['curb'] + 12)
curb('CurbFL', PX - 0.06 - cx0, CURB_W, -(cx0 + (PX - 0.06 - cx0) / 2), -SY + CURB_W / 2, T['curb'] + 16)
curb('CurbFR', PX - 0.06 - cx0, CURB_W, (cx0 + (PX - 0.06 - cx0) / 2), -SY + CURB_W / 2, T['curb'] + 20)

# клей: по ряду — гребёнка (зубчатый шпатель, шаг 12 мм), гребни вдоль хода шпателя
ROW_Y = [TY - TP / 2 - r * TP for r in range(ROWS)]          # от дальнего ряда к ближнему
COL_X = [-TX + TP / 2 + c * TP for c in range(COLS)]
def row_dir(r): return 1 if r % 2 == 0 else -1
X_END = TX + 0.006                     # край прохода шпателя (у бордюра)
def trowel_x(r, f):
    # положение шпателя (нижняя кромка лезвия) на проходе ряда r: плавный разгон и остановка
    s = T['glue'] + r * RP
    t = seg(f, s, s + TROW)
    x0, x1 = (-X_END, X_END) if row_dir(r) > 0 else (X_END, -X_END)
    return x0 + (x1 - x0) * smoother(t)
GLUE_ROWS = []
for r in range(ROWS):
    nx_, ny_ = 152, 201
    gx, gy, gf = grid(nx_, ny_, -TX - 0.01, TX + 0.01, ROW_Y[r] - TP / 2 + 0.006, ROW_Y[r] + TP / 2 - 0.006)
    H = Height('Glue%d' % r, gx, gy, gf, [GLUE])
    yy = gy.ravel() - (ROW_Y[r] - TP / 2 + 0.006)
    per = 0.012; ph = (yy / per) % 1.0
    ridge = np.clip(1.6 - np.abs(ph - 0.5) * 4.2, 0, 1)          # трапеция: гребень 6 мм
    edge = npsm(yy / 0.01) * npsm((TP - 0.012 - yy) / 0.01)
    jit = smooth_noise(gx, gy, 20 + r, fmin=3, fmax=25, n=6).ravel()
    H.base = Z_TOP + 0.0004; H.zr = Z_TOP + 0.0004 + (0.0052 + 0.0008 * jit) * ridge * edge + 0.0006 * edge
    H.gx = gx.ravel().astype(np.float32); H.row = r
    GLUE_ROWS.append(H)

def glue_fn_make(H):
    r = H.row
    s = T['glue'] + r * RP
    @item
    def fn(f):
        vis = f >= s
        H.ob.hide_render = not vis
        if not vis: return (False,), (lambda: [])
        xt = trowel_x(r, f); d = row_dir(r)
        key = round(xt, 4)
        if H.last != key:
            if d > 0:
                Xc = np.minimum(H.gx, xt); cover = np.clip((xt - H.gx) / 0.02, 0, 1)
            else:
                Xc = np.maximum(H.gx, xt); cover = np.clip((H.gx - xt) / 0.02, 0, 1)
            Z = H.base + (H.zr - H.base) * cover
            H.set(Z, Xc); H.last = key
        xp = trowel_x(r, f - 1)
        x0, x1 = min(xp, xt) - 0.05, max(xp, xt) + 0.05
        y0, y1 = ROW_Y[r] - TP / 2, ROW_Y[r] + TP / 2
        return (True, key), (lambda: lbox(x0, x1, y0, y1, Z_TOP, Z_TOP + 0.012))
    return fn
for H in GLUE_ROWS: glue_fn_make(H)

# шпатель: лезвие 600 мм с зубцами, держатель, ручка
def build_trowel(bm):
    # лезвие в плоскости YZ (x=0), зубцы вниз; ход по +X
    W = TP - 0.012; teeth = int(W / 0.012)
    pts = []
    pts.append((-W / 2, 0.11))
    for i in range(teeth):
        y = -W / 2 + i * 0.012
        pts += [(y, 0.006), (y + 0.0015, 0.0), (y + 0.0045, 0.0), (y + 0.006, 0.006)]
    pts.append((W / 2, 0.006)); pts.append((W / 2, 0.11))
    fv = [bm.verts.new((-0.0012, y, z)) for y, z in pts]; bv = [bm.verts.new((0.0012, y, z)) for y, z in pts]
    n = len(pts); faces = [bm.faces.new(fv[::-1]), bm.faces.new(bv)]
    for i in range(n):
        j = (i + 1) % n; faces.append(bm.faces.new((fv[i], fv[j], bv[j], bv[i])))
    for f_ in faces: f_.material_index = 0
    # держатель и ручка
    r = bm_box(bm, 0.03, W + 0.01, 0.025, cx=0.0, cy=0, z0=0.10, mat=0)
    r = bm_box(bm, 0.028, 0.03, 0.10, cx=0.0, cy=0, z0=0.125, mat=1)
    r = bm_box(bm, 0.032, 0.20, 0.032, cx=0.0, cy=0, z0=0.215, mat=1)
TROWEL = obj_bm('Trowel', build_trowel, [STEEL, HANDLE], bw=0.0, smooth=False)
bead_me = bpy.data.meshes.new('Bead'); bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.011, radius2=0.011, depth=TP - 0.03)
for v in bm.verts: v.co = Vector((v.co.x, v.co.z, v.co.y * 0.6))
bm.to_mesh(bead_me); bm.free(); bead_me.materials.append(GLUE)
BEAD = bpy.data.objects.new('Bead', bead_me); link(BEAD)
TILT = math.radians(30)        # наклон лезвия от вертикали (верх — вперёд по ходу)
G0 = T['glue'] - 14                                   # шпатель опускается к первому ряду
GEND = T['glue'] + (ROWS - 1) * RP + TROW            # конец последнего прохода
@item
def trowel_fn(f):
    vis = G0 <= f <= GEND + 18
    TROWEL.hide_render = BEAD.hide_render = not vis
    if not vis: return (False,), (lambda: [])
    al = 1.0; bead = 0.0; tl = 0.12
    if f < T['glue']:
        a = eout(seg(f, G0, T['glue'])); x = trowel_x(0, T['glue']); y = ROW_Y[0]; z = 0.45 * (1 - a); d = row_dir(0)
        al = sm(seg(f, G0 - 1, G0 + FADE))
    elif f > GEND:
        b = ein(seg(f, GEND + 2, GEND + 18)); r = ROWS - 1; x = trowel_x(r, GEND); y = ROW_Y[r]; z = 0.55 * b; d = row_dir(r)
        al = 1 - sm(seg(f, GEND + 18 - FADE, GEND + 18))
    else:
        k = min(int((f - T['glue']) // RP), ROWS - 1); s = T['glue'] + k * RP
        if f <= s + TROW:                      # проход: клей + гребёнка
            x = trowel_x(k, f); y = ROW_Y[k]; z = 0.0; d = row_dir(k)
            kk = sm(seg(f, s, s + 6)) * (1 - sm(seg(f, s + TROW - 6, s + TROW)))
            tl = 0.12 + 0.88 * kk
            bead = sm(seg(f, s, s + 8)) * (1 - sm(seg(f, s + TROW - 8, s + TROW)))
        elif f <= s + RP - TTURN:              # ждёт у бордюра, пока укладывают плитку
            x = trowel_x(k, s + TROW); y = ROW_Y[k]; z = 0.0; d = row_dir(k)
        else:                                  # переход на следующий ряд
            t = sm(seg(f, s + RP - TTURN, s + RP))
            x = trowel_x(k, s + TROW); y = ROW_Y[k] + (ROW_Y[k + 1] - ROW_Y[k]) * t
            z = 0.07 * math.sin(math.pi * t); d = row_dir(k) + (row_dir(k + 1) - row_dir(k)) * t
    zc = Z_TOP + 0.0004
    TROWEL.location = (x, y, zc + z)
    TROWEL.rotation_euler = (0, TILT * tl * d, 0)
    TROWEL.color = (1, 1, 1, al); TROWEL.hide_render = al <= 0.002
    BEAD.hide_render = bead <= 0.02 or not vis
    sd = 1 if d > 0 else -1
    BEAD.location = (x + sd * 0.013 * max(bead, 0.3), y, Z_TOP + 0.003 * max(bead, 0.3)); BEAD.scale = (max(bead, 0.02), 1, max(bead, 0.02))
    sig = (True, round(x, 4), round(y, 4), round(z, 4), round(d, 4), round(tl, 4), round(al, 3), round(bead, 3))
    return sig, (lambda: wbox(TROWEL, 0.02) + wbox(BEAD, 0.01))

TILES = []
for r in range(ROWS):
    s = T['glue'] + r * RP; d = row_dir(r)
    for c in range(COLS):
        ob = box('Tile%d%d' % (r, c), TP - 0.002, TP - 0.002, TILE_T, G, (COL_X[c], ROW_Y[r], Z_TILE0), bw=0.0015)
        # после прохода шпателя по всему ряду плитки ложатся по порядку — от начала прохода
        i = c if d > 0 else COLS - 1 - c
        tp = s + TROW + 2 + i * TLAY
        rng = np.random.default_rng(100 + r * 10 + c)
        tl = (float(rng.uniform(-0.05, 0.05)), float(rng.uniform(-0.05, 0.05)))
        rigid(ob, (lambda tp, tl: lambda f: drop(f, tp, TDROP, h=0.20, tilt=tl))(tp, tl), pad=0.005)
        TILES.append(ob)

# ================================================================ 5. Ограда: столбы, перемычки, цветники
def build_post(bm):
    bm_box(bm, 0.12, 0.12, 0.40, z0=0.0)
    bm_box(bm, 0.14, 0.14, 0.02, z0=0.40)
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.14 / math.sqrt(2), radius2=0.002, depth=0.06)
    for v in r['verts']:
        v.co = Matrix.Rotation(math.pi / 4, 3, 'Z') @ v.co; v.co.z += 0.42 + 0.03
POSTS = [(-PX, PY), (PX, PY), (PX, -PY), (-PX, -PY), (0, -PY)]
for i, (x, y) in enumerate(POSTS):
    ob = obj_bm('Post%d' % i, build_post, [G], bw=0.003, loc=(x, y, Z_TOP), ang=30)
    f0 = T['posts'] + 5 * i
    rigid(ob, (lambda f0: lambda f: drop(f, f0, 16, h=0.32, tilt=(0.02, 0.03)))(f0))
RAIL_Z = 0.26
def rail(name, a, b, f0):
    (x0, y0), (x1, y1) = a, b
    L = math.hypot(x1 - x0, y1 - y0) - 0.12
    ob = box(name, L, 0.05, 0.06, G, ((x0 + x1) / 2, (y0 + y1) / 2, Z_TOP + RAIL_Z), bw=0.003)
    ob.rotation_euler = (0, 0, math.atan2(y1 - y0, x1 - x0))
    rigid(ob, lambda f: drop(f, f0, 14, h=0.22))
rail('RailL', POSTS[0], POSTS[3], T['rails'])
rail('RailR', POSTS[1], POSTS[2], T['rails'] + 4)
rail('RailFL', POSTS[3], POSTS[4], T['rails'] + 8)
rail('RailFR', POSTS[4], POSTS[2], T['rails'] + 12)

BED_W, BED_L, BED_T, BED_H = 0.60, 1.30, 0.05, 0.10
BED_X = [-0.38, 0.38]; BED_Y0, BED_Y1 = -0.56, 0.74
def build_bed(bm):
    cyc = (BED_Y0 + BED_Y1) / 2
    bm_box(bm, BED_W, BED_T, BED_H, cy=BED_Y0 + BED_T / 2 - cyc)
    bm_box(bm, BED_W, BED_T, BED_H, cy=BED_Y1 - BED_T / 2 - cyc)
    bm_box(bm, BED_T, BED_L - 2 * BED_T, BED_H, cx=-BED_W / 2 + BED_T / 2, cy=0)
    bm_box(bm, BED_T, BED_L - 2 * BED_T, BED_H, cx=BED_W / 2 - BED_T / 2, cy=0)
for i, bx in enumerate(BED_X):
    ob = obj_bm('Bed%d' % i, build_bed, [G], bw=0.003, loc=(bx, (BED_Y0 + BED_Y1) / 2, Z_TILE))
    f0 = T['beds'] + 7 * i
    rigid(ob, (lambda f0: lambda f: drop(f, f0, 16, h=0.25, tilt=(0.02, -0.02)))(f0))

# ================================================================ 6. Памятник: подставка и две стелы с крестом по шву
PED = box('Pedestal', 1.40, 0.28, 0.15, G, (0, 0.95, Z_TILE), bw=0.004)
rigid(PED, lambda f: drop(f, T['pedestal'], 16, h=0.3, tilt=(0.02, 0.0)))
Z_PED = Z_TILE + 0.15
STW, STH, STT = 0.62, 1.00, 0.08
CR_W, CR_Z0, CR_Z1, CR_A0, CR_A1, CR_AW = 0.045, 0.30, 0.86, 0.60, 0.68, 0.17
def stele_profile(side):
    # side = -1 левая (шов справа, x=0), +1 правая (шов слева). Скругление внешнего верхнего угла
    s = side; rr = 0.14; pts = []
    xo = s * STW                          # внешний край
    # обход против часовой для левой; для правой отражаем
    seq = [(0, 0), (0, CR_Z0), (s * CR_W, CR_Z0), (s * CR_W, CR_A0), (s * CR_AW, CR_A0), (s * CR_AW, CR_A1),
           (s * CR_W, CR_A1), (s * CR_W, CR_Z1), (0, CR_Z1), (0, STH)]
    pts += seq
    for i in range(9):
        a = math.pi / 2 * i / 8
        pts.append((xo - s * rr + s * rr * math.sin(a), STH - rr + rr * math.cos(a)))
    pts.append((xo, 0))
    if s > 0: pts = pts[::-1]
    return pts
STELES = []
for side in (-1, 1):
    ob = obj_bm('Stele%s' % ('L' if side < 0 else 'R'), lambda bm, side=side: extrude_profile(bm, stele_profile(side), STT), [G], bw=0.003, loc=(0, 0.95, Z_PED), ang=30)
    STELES.append(ob)
def stele_pose_L(f):
    f0 = T['steleL']
    if f < f0: return False, (0, 0, 0), (0, 0, 0), 0.0
    t = seg(f, f0, f0 + 34); e = smoother(t)
    k = 1 - e
    return True, (0, 0, 0.6 * k), (0.0, 0.015 * math.sin(t * 7.0) * k, 0.0), sm(seg(f, f0 - 1, f0 + FADE + 2))
def stele_pose_R(f):
    f0 = T['steleR']
    if f < f0: return False, (0, 0, 0), (0, 0, 0), 0.0
    t = seg(f, f0, f0 + 30); e = smoother(t)
    sx_ = 0.12 * (1 - smoother(seg(f, f0 + 30, f0 + 44)))
    k = 1 - e
    return True, (sx_, 0, 0.6 * k), (0.0, -0.015 * math.sin(t * 7.0) * k, 0.0), sm(seg(f, f0 - 1, f0 + FADE + 2))
rigid(STELES[0], stele_pose_L); rigid(STELES[1], stele_pose_R)

# ================================================================ 7. Декор: белый щебень, ваза с цветами
GRAV = []
for i, bx in enumerate(BED_X):
    cyc = (BED_Y0 + BED_Y1) / 2
    x0, x1 = -BED_W / 2 + BED_T + 0.002, BED_W / 2 - BED_T - 0.002
    y0, y1 = BED_Y0 + BED_T + 0.002 - cyc, BED_Y1 - BED_T - 0.002 - cyc
    gx, gy, gf = grid(int((x1 - x0) / 0.0045) + 1, int((y1 - y0) / 0.0045) + 1, x0, x1, y0, y1)
    rng = np.random.default_rng(50 + i)
    npb = int((x1 - x0) * (y1 - y0) / (0.0125 ** 2) * 1.1)
    cen = np.stack([rng.uniform(x0, x1, npb), rng.uniform(y0, y1, npb)], 1)
    rad = rng.uniform(0.0055, 0.0105, npb)
    kd = KDTree(npb)
    for j in range(npb): kd.insert((cen[j, 0], cen[j, 1], 0), j)
    kd.balance()
    X = gx.ravel(); Y = gy.ravel(); hgt = np.zeros(X.size); col = np.zeros((X.size, 3), np.float32)
    tone = rng.uniform(0.70, 0.93, npb); warm = rng.uniform(-0.03, 0.03, npb)
    for v in range(X.size):
        best_h = 0.0; bj = 0
        for (pco, j, dist) in kd.find_n((X[v], Y[v], 0), 3):
            hh = rad[j] * math.sqrt(max(0.0, 1 - (dist / (rad[j] * 1.25)) ** 2)) * 0.85
            if hh > best_h: best_h = hh; bj = j
        hgt[v] = best_h; tn = tone[bj]
        col[v] = (tn + warm[bj], tn + warm[bj] * 0.3, tn - warm[bj])
    lin = np.clip(col, 0, 1) ** 2.2
    Hh = Height('Gravel%d' % i, gx, gy, gf, [GRAVEL], colors=lin.astype(np.float32))
    Hh.ob.location = (bx, (BED_Y0 + BED_Y1) / 2, 0)
    Hh.hgt = hgt; Hh.Yl = Y; Hh.ylen = (y1 - y0); Hh.y0 = y0
    Hh.f0 = T['gravel'] + 6 * i
    GRAV.append(Hh)
def gravel_make(Hh):
    @item
    def fn(f):
        vis = f >= Hh.f0
        Hh.ob.hide_render = not vis
        if not vis: return (False,), (lambda: [])
        p = seg(f, Hh.f0, Hh.f0 + 24); key = round(p, 4)
        if Hh.last != key:
            ph = (Hh.y0 + Hh.ylen - Hh.Yl) / Hh.ylen               # насыпаем от дальнего края
            fill = npsm((p * 1.5 - ph * 0.5) / 0.5)
            Z = Z_TILE - 0.002 + fill * (0.062 + Hh.hgt)
            Hh.set(Z); Hh.last = key
        bx = Hh.ob.location.x
        return (True, key), (lambda: Hh.box(0.02, 0.01))
for Hh in GRAV: gravel_make(Hh)

def build_vase(bm):
    prof = [(0.0, 0.0), (0.055, 0.0), (0.055, 0.03), (0.045, 0.035), (0.040, 0.06), (0.044, 0.20), (0.052, 0.27), (0.052, 0.285), (0.044, 0.285), (0.036, 0.20), (0.0, 0.20)]
    vs = [bm.verts.new((x, 0, z)) for x, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), steps=40, angle=2 * math.pi, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    rng = np.random.default_rng(7)
    for k in range(7):
        a = k / 7 * 2 * math.pi + rng.uniform(-0.3, 0.3); rr = 0.018 if k else 0.0
        top = Vector((rr * math.cos(a), rr * math.sin(a), 0.42 + rng.uniform(-0.03, 0.03)))
        base = Vector((0, 0, 0.18)); d = top - base
        r = bmesh.ops.create_cone(bm, cap_ends=False, segments=6, radius1=0.003, radius2=0.003, depth=d.length)
        q = d.normalized().to_track_quat('Z', 'Y')
        for v in r['verts']:
            v.co = q @ v.co + (base + top) / 2
        for f_ in {f_ for v in r['verts'] for f_ in v.link_faces}: f_.material_index = 2
        s = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.028)
        for v in s['verts']:
            v.co = Vector((v.co.x * 1.0, v.co.y * 1.0, v.co.z * 0.75)) + top
        for f_ in {f_ for v in s['verts'] for f_ in v.link_faces}: f_.material_index = 1
VASE = obj_bm('Vase', build_vase, [G, PETAL, LEAF], bw=0.0, smooth=True, ang=50, loc=(0, 0.62, Z_TILE))
rigid(VASE, lambda f: drop(f, T['vase'], 22, h=0.3, tilt=(0.03, 0.02)))

# ---------------------------------------------------------------- плавное появление: альфа = Object Info › Alpha (ob.color[3])
def fadeable(m):
    nt_ = m.node_tree; out = next(n for n in nt_.nodes if n.type == 'OUTPUT_MATERIAL')
    lk = next(l for l in nt_.links if l.to_socket == out.inputs['Surface'])
    src = lk.from_socket; nt_.links.remove(lk)
    oi = nt_.nodes.new('ShaderNodeObjectInfo'); tr = nt_.nodes.new('ShaderNodeBsdfTransparent'); mx = nt_.nodes.new('ShaderNodeMixShader')
    nt_.links.new(oi.outputs['Alpha'], mx.inputs['Fac']); nt_.links.new(tr.outputs[0], mx.inputs[1]); nt_.links.new(src, mx.inputs[2])
    nt_.links.new(mx.outputs[0], out.inputs['Surface'])
for m_ in list(bpy.data.materials): fadeable(m_)

# ---------------------------------------------------------------- земля (shadow catcher)
me = bpy.data.meshes.new('ground'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30); bm.to_mesh(me); bm.free()
gr = bpy.data.objects.new('ground', me); sc.collection.objects.link(gr); gr.location = (0, 15, 0); gr.is_shadow_catcher = True
me.materials.append(mat_simple('GroundBounce', (0.42, 0.30, 0.20), 0.95, spec=0.2))

# ---------------------------------------------------------------- состояние и область изменений
def evaluate(f):
    CUR_F[0] = f
    res = [fn(f) for fn in items]
    bpy.context.view_layer.update()
    return [(s, p()) for (s, p) in res]

def to_px(P):
    v = world_to_camera_view(sc, co, P)
    return v.x * RW, (1 - v.y) * RH, v.z

CUR_F = [0]
def planes_now():
    f = CUR_F[0]
    sh = [0.0] + ([Z_TOP] if f >= T['pour'] else []) + ([Z_TILE] if f >= T['glue'] else [])
    mr = ([Z_TOP] if T['pour'] <= f <= T['dry_end'] + 2 else []) + ([Z_TILE] if f >= T['glue'] else [])
    return sh, mr
def parts_of(points, shadow=True):
    # части области изменения: сам предмет (+ отражённый свет вокруг высоких предметов), его тени, отражения на плите
    if not points: return []
    sh, mr = planes_now()
    obj = list(points)
    zs = [P.z for P in points]; hgt = max(zs) - min(0.0, min(zs))
    if hgt > 0.25 and min(zs) < 0.3:
        xs_ = [P.x for P in points]; ys_ = [P.y for P in points]
        rr = min(0.3 * hgt, 0.5 * max(max(xs_) - min(xs_), max(ys_) - min(ys_)))     # тонкие предметы почти не подсвечивают землю
        obj += [Vector((x, y, 0.0)) for x in (min(xs_) - rr, max(xs_) + rr) for y in (min(ys_) - rr, max(ys_) + rr)]
    parts = [(obj, False)]
    shd = [P - SUN * ((P.z - zp) / SUN.z) for P in points for zp in sh if P.z > zp + 1e-4] if shadow else []
    if shd: parts.append((shd + [P for P in points if P.z < 0.35], False))     # тень + основание (тень от него начинается)
    mir = [Vector((P.x, P.y, 2 * zp - P.z)) for P in points for zp in mr if P.z > zp + 1e-4]
    if mir: parts.append((mir, True))
    return parts

def bbox_px(pts, margin, clamp=False):
    xs_, ys_ = [], []
    for P in pts:
        x, y, z = to_px(P)
        if z <= 0.01: continue
        if clamp:          # отражение видно только на плите
            x = min(max(x, SLAB_PX[0]), SLAB_PX[2]); y = min(max(y, SLAB_PX[1]), SLAB_PX[3])
        xs_.append(x); ys_.append(y)
    if not xs_: return None
    x0 = max(0, int(min(xs_)) - margin); y0 = max(0, int(min(ys_)) - margin)
    x1 = min(RW, int(max(xs_)) + 1 + margin); y1 = min(RH, int(max(ys_)) + 1 + margin)
    return [x0, y0, x1, y1] if x1 > x0 and y1 > y0 else None

def _slab_px():
    xs_, ys_ = [], []
    for P in lbox(-SX - 0.05, SX + 0.05, -SY - 0.05, SY + 0.05, Z_TOP, Z_TILE + 0.07):
        x, y, z = to_px(P); xs_.append(x); ys_.append(y)
    return [min(xs_), min(ys_), max(xs_), max(ys_)]
SLAB_PX = _slab_px()

def area(r): return (r[2] - r[0]) * (r[3] - r[1])
def outer_of(rc):
    if rc == [0, 0, RW, RH]: return rc
    return [max(0, rc[0] - CTX), max(0, rc[1] - CTX), min(RW, rc[2] + CTX), min(RH, rc[3] + CTX)]
CTX = int(0.0125 * RW)       # контекст денойзера вокруг области (24 px при 1920: тест — как 42 px)
C_CALL = 0.02                # цена отдельного вызова рендера в долях полного кадра (синхронизация, денойзер)
CS = 8                       # ячейка маски изменений (px)
def rect_cost(r):
    o = outer_of(r); return (o[2] - o[0]) * (o[3] - o[1]) / float(RW * RH) + C_CALL
def cover_rects(rects):
    # маска изменённых ячеек → несколько непересекающихся прямоугольников минимальной цены:
    # рекурсивно делим (по x или y) там, где сумма цен двух плотных рамок меньше цены одной
    rs = [r for r in rects if r]
    if not rs: return []
    gw, gh = (RW + CS - 1) // CS, (RH + CS - 1) // CS
    Mk = np.zeros((gh, gw), bool)
    for x0, y0, x1, y1 in rs:
        Mk[y0 // CS:(y1 + CS - 1) // CS, x0 // CS:(x1 + CS - 1) // CS] = True
    def px(c): return [int(c[0]) * CS, int(c[1]) * CS, min(RW, int(c[2]) * CS), min(RH, int(c[3]) * CS)]
    def tight(x0, y0, x1, y1):
        sub = Mk[y0:y1, x0:x1]; rr = np.nonzero(sub.any(1))[0]
        if not len(rr): return None
        cc = np.nonzero(sub.any(0))[0]
        return (x0 + cc[0], y0 + rr[0], x0 + cc[-1] + 1, y0 + rr[-1] + 1)
    def best_split(c, axis):
        x0, y0, x1, y1 = c; sub = Mk[y0:y1, x0:x1]
        if axis == 1: sub = sub.T                         # делим по y: работаем с транспонированной
        h, w = sub.shape
        if w < 2: return None
        L = np.logical_or.accumulate(sub, axis=1); R = np.logical_or.accumulate(sub[:, ::-1], axis=1)[:, ::-1]
        col = sub.any(0); idx = np.arange(w)
        lastL = np.maximum.accumulate(np.where(col, idx, -1))            # последний занятый столбец ≤ i
        firstR = np.minimum.accumulate(np.where(col, idx, w)[::-1])[::-1]  # первый занятый столбец ≥ i
        out = None
        for sp in range(1, w):
            if lastL[sp - 1] < 0 or firstR[sp] >= w: continue
            la = L[:, sp - 1]; ra = R[:, sp]
            lr = np.nonzero(la)[0]; rr_ = np.nonzero(ra)[0]
            a = (0, lr[0], lastL[sp - 1] + 1, lr[-1] + 1); b = (firstR[sp], rr_[0], w, rr_[-1] + 1)
            if axis == 1:
                a = (x0 + a[1], y0 + a[0], x0 + a[3], y0 + a[2]); b = (x0 + b[1], y0 + b[0], x0 + b[3], y0 + b[2])
            else:
                a = (x0 + a[0], y0 + a[1], x0 + a[2], y0 + a[3]); b = (x0 + b[0], y0 + b[1], x0 + b[2], y0 + b[3])
            cst = rect_cost(px(a)) + rect_cost(px(b))
            if out is None or cst < out[0]: out = (cst, a, b)
        return out
    def solve(c, depth=0):
        base = rect_cost(px(c))
        if depth > 10: return [px(c)]
        cands = [b for b in (best_split(c, 0), best_split(c, 1)) if b]
        if not cands: return [px(c)]
        cst, a, b = min(cands, key=lambda t: t[0])
        if cst >= base - 1e-6: return [px(c)]
        ta = tight(*a); tb = tight(*b)
        return (solve(ta, depth + 1) if ta else []) + (solve(tb, depth + 1) if tb else [])
    c0 = tight(0, 0, gw, gh)
    return solve(c0) if c0 else []

def stele_region():
    pts = []
    for ob in STELES + [PED]:
        if not ob.hide_render: pts += wbox(ob, 0.02)
    return pts

def dirty_rects(prev, cur):
    groups = []
    front_moving = False
    for (s0, p0), (s1, p1) in zip(prev, cur):
        if s0 == s1: continue
        front_moving = True
        if isinstance(p1, dict) and p1.get('delta'):
            groups += p1.get('groups', []); continue
        for p in (p0, p1):
            if isinstance(p, dict):
                groups += p.get('groups', []); groups += [('ns', g) for g in p.get('ns', [])]
            elif p: groups.append(p)
    if not groups: return []
    m = int(0.0085 * RW); rects = []
    for g in groups:
        ns = isinstance(g, tuple)
        if ns: g = g[1]
        for pts, mir in parts_of(g, shadow=not ns):
            r = bbox_px(pts, m, clamp=mir)
            if r: rects.append(r)
    if front_moving and any(not ob.hide_render for ob in STELES):
        r = bbox_px(stele_region(), m)                    # отражения движущихся предметов в полированных стелах
        if r: rects.append(r)
    return cover_rects(rects)

# ---------------------------------------------------------------- рендер
def parse_frames(s):
    out = []
    for part in s.split(','):
        part = part.strip()
        if not part: continue
        if '-' in part:
            a, b = part.split('-'); out += list(range(int(a), int(b) + 1))
        else: out.append(int(part))
    return [f for f in out if 0 <= f < NFR]

def render_rect(path, rect):
    x0, y0, x1, y1 = rect
    r = sc.render
    full = (x0 == 0 and y0 == 0 and x1 == RW and y1 == RH)
    r.use_border = not full; r.use_crop_to_border = not full
    if not full:
        r.border_min_x = (x0 + 0.01) / RW; r.border_max_x = (x1 + 0.01) / RW
        r.border_min_y = (RH - y1 + 0.01) / RH; r.border_max_y = (RH - y0 + 0.01) / RH
    bpy.ops.render.render(write_still=False)
    img = bpy.data.images['Render Result']
    img.save_render(path)

if A.exec:
    exec(open(A.exec).read()); sys.exit(0)
if A.dbg:
    for f in parse_frames(A.dbg):
        p_ = evaluate(f - 1); c_ = evaluate(f)
        for idx, ((s0, q0), (s1, q1)) in enumerate(zip(p_, c_)):
            if s0 != s1:
                gs = (q0['groups'] + q0.get('ns', []) if isinstance(q0, dict) else [q0]) + (q1['groups'] + q1.get('ns', []) if isinstance(q1, dict) else [q1])
                gs = gs if isinstance(q0, dict) or isinstance(q1, dict) else [q0 + q1]
                rs = [r for g in gs for pts, mir in parts_of(g) for r in [bbox_px(pts, int(0.012 * RW), mir)] if r]
                fn = items[idx]; nm = getattr(fn, '__name__', '?'); cl = fn.__closure__
                obn = [c.cell_contents.name for c in (cl or []) if hasattr(c.cell_contents, 'name') and hasattr(c.cell_contents, 'type')]
                print('DBG', f, idx, nm, obn[:2], [[int(v) for v in r] for r in rs], ['%.3f' % (area(r) / (RW * RH)) for r in rs])
        inner = dirty_rects(p_, c_)
        print('DBG', f, 'TOTAL', inner, '%.3f' % (sum(area(outer_of(r)) for r in inner) / (RW * RH)))
    sys.exit(0)
if A.plan:
    # цена кадра ≈ площадь перерисовки (доля кадра) + постоянная часть (синхронизация сцены, BVH)
    OVH = 0.015
    cost = []; prev = None
    for f in range(NFR):
        cur = evaluate(f)
        inner = [[0, 0, RW, RH]] if prev is None else dirty_rects(prev, cur)
        cost.append(round(OVH + sum(area(outer_of(rc)) for rc in inner) / float(RW * RH), 4))
        prev = cur
    # шард начинается с любого кадра: области считаются от состояния f-1 (полный кадр нужен только для 0)
    n = max(1, A.shards); tot = sum(cost); goal = tot / n
    shards = []; a = 0; acc = cost[0]
    for f in range(1, NFR):
        if acc + cost[f] > goal and len(shards) < n - 1 and f - a >= 8:
            shards.append([a, f - 1]); a = f; acc = cost[f]
        else: acc += cost[f]
    shards.append([a, NFR - 1])
    json.dump({'count': NFR, 'cost': cost, 'total': round(sum(cost), 2), 'shards': shards}, open(A.plan, 'w'))
    print('PLAN', NFR, 'cost', round(sum(cost), 1), 'shards', len(shards), shards); sys.exit(0)

os.makedirs(A.out, exist_ok=True)
frames = parse_frames(A.frames)
full_set = set(parse_frames(A.full)) | {0}
log = []
prev = None; prev_f = None
for f in frames:
    t0 = time.time()
    if prev is None or prev_f != f - 1:
        prev = evaluate(f - 1) if f > 0 else None
    cur = evaluate(f)
    if A.allfull or f in full_set or prev is None:
        inner = [[0, 0, RW, RH]]
    else:
        inner = dirty_rects(prev, cur)
    recs = []
    for k, rc in enumerate(inner):
        outer = outer_of(rc)
        p = os.path.join(A.out, 'r%04d_%d.png' % (f, k))
        render_rect(p, outer)
        recs.append({'file': os.path.basename(p), 'outer': outer, 'inner': rc})
    meta = {'f': f, 'rects': recs, 'sec': round(time.time() - t0, 2), 'w': RW, 'h': RH}
    json.dump(meta, open(os.path.join(A.out, 'r%04d.json' % f), 'w'))
    print('FRAME', json.dumps(meta), flush=True)
    prev = cur; prev_f = f
print('DONE', len(frames))
