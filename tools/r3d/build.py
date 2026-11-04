# Сцена памятника для Blender (Cycles CPU): стела по контуру + тумба + цветник с крошкой; AOV-альбедо для перекраски гранита
import bpy, bmesh, math, sys, os, json
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
spec = json.load(open(argv[0]))
OUT = spec['out']; RES = spec.get('res', 1000); SPP = spec.get('samples', 64)
GR = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'granites.json')))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; vl = sc.view_layers[0]
sc.render.engine = 'CYCLES'; cy = sc.cycles
cy.device = 'CPU'; cy.samples = SPP; cy.use_adaptive_sampling = True; cy.adaptive_threshold = spec.get('adaptive', 0.015)
cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
B_ = spec.get('bounces', [6, 3, 3]); cy.max_bounces = B_[0]; cy.diffuse_bounces = B_[1]; cy.glossy_bounces = B_[2]; cy.transmission_bounces = 1; cy.transparent_max_bounces = 2
if spec.get('fastgi'): cy.use_fast_gi = True; cy.fast_gi_method = 'REPLACE'; cy.ao_bounces_render = 1
cy.caustics_reflective = False; cy.caustics_refractive = False; cy.blur_glossy = 1.0
sc.render.resolution_x = RES; sc.render.resolution_y = RES; sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = spec.get('exposure', 0.0)
sc.render.threads_mode = 'AUTO'
sc.render.use_persistent_data = False
REG = spec.get('region')  # [x0, y0, x1, y1] px от левого верхнего угла: крупный кадр (ограды 2000²) рендерится частями —
if REG:                     # проходов много (5 гранитов), шумодав целого кадра не помещается в память; части сшивает post.py
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x = REG[0] / RES; sc.render.border_max_x = REG[2] / RES
    sc.render.border_min_y = 1 - REG[3] / RES; sc.render.border_max_y = 1 - REG[1] / RES

def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; return m, m.node_tree.nodes, m.node_tree.links

# ---------- гранит: фото-текстуры образцов (texsynth.py → бесшовные плитки), AOV g0..gN — альбедо каждого варианта ----------
VARS = spec.get('variants', [g['id'] for g in GR])
for k in range(len(VARS)):
    a = vl.aovs.add(); a.name = 'g%d' % k; a.type = 'COLOR'
KIND = spec.get('kind', 'monument')
PHOTO = KIND != 'fence'  # блеск/резьба с исходного фото — только у памятников (у оград фото нет)
for nm, tp in (('pg', 'COLOR'), ('fw', 'VALUE'), ('cv', 'VALUE')) if PHOTO else ():
    a = vl.aovs.add(); a.name = nm; a.type = tp
TEX = spec.get('tex', {})  # id → {path, size_m}
IMGS = {}
def img_of(path, color='Non-Color'):
    if path not in IMGS:
        im = bpy.data.images.load(path); im.colorspace_settings.name = color; IMGS[path] = im
    return IMGS[path]

def granite_tex(n, l, vid, rnd, k, P, W3):
    # трипланарная проекция в мировых координатах: одинаковая ориентация рисунка у всех деталей (стела повёрнута, тумба — нет)
    t = TEX[vid]; acc = None
    of = n.new('ShaderNodeVectorMath'); of.operation = 'SCALE'; l.new(rnd, of.inputs[0]); of.inputs['Scale'].default_value = 7.31 + 1.7 * k
    sc_ = n.new('ShaderNodeVectorMath'); sc_.operation = 'MULTIPLY_ADD'
    l.new(P, sc_.inputs[0]); sc_.inputs[1].default_value = (1 / t['size_m'],) * 3; l.new(of.outputs[0], sc_.inputs[2])
    sp_ = n.new('ShaderNodeSeparateXYZ'); l.new(sc_.outputs[0], sp_.inputs[0])
    for ax, (u, v) in enumerate((('Y', 'Z'), ('X', 'Z'), ('X', 'Y'))):
        cb = n.new('ShaderNodeCombineXYZ'); l.new(sp_.outputs[u], cb.inputs[0]); l.new(sp_.outputs[v], cb.inputs[1])
        tx = n.new('ShaderNodeTexImage'); tx.image = img_of(t['path']); tx.interpolation = 'Cubic'; tx.extension = 'REPEAT'
        l.new(cb.outputs[0], tx.inputs['Vector'])
        mw = n.new('ShaderNodeVectorMath'); mw.operation = 'SCALE'; l.new(tx.outputs['Color'], mw.inputs[0]); l.new(W3[ax], mw.inputs['Scale'])
        if acc is None: acc = mw.outputs[0]
        else:
            ad = n.new('ShaderNodeVectorMath'); ad.operation = 'ADD'; l.new(acc, ad.inputs[0]); l.new(mw.outputs[0], ad.inputs[1]); acc = ad.outputs[0]
    return acc

def zero_aovs(n, l, cv=True):
    if not PHOTO: return
    for nm in ('pg', 'fw', 'cv') if cv else ('pg', 'fw'):
        ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = nm
        if nm == 'pg': ao.inputs['Color'].default_value = (0, 0, 0, 1)
        else: ao.inputs['Value'].default_value = 1.0 if nm == 'cv' else 0.0

def mat_granite(name, rough=0.08, extra=None):
    m, n, l = new_mat(name); p = n['Principled BSDF']
    tc = n.new('ShaderNodeTexCoord'); oi = n.new('ShaderNodeObjectInfo')
    rv = n.new('ShaderNodeCombineXYZ'); l.new(oi.outputs['Random'], rv.inputs[0])
    rr_ = n.new('ShaderNodeMath'); rr_.operation = 'FRACT'; mul = n.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 7.13
    l.new(oi.outputs['Random'], mul.inputs[0]); l.new(mul.outputs[0], rr_.inputs[0]); l.new(rr_.outputs[0], rv.inputs[1])
    rz = n.new('ShaderNodeMath'); rz.operation = 'FRACT'; mz = n.new('ShaderNodeMath'); mz.operation = 'MULTIPLY'; mz.inputs[1].default_value = 3.71
    l.new(oi.outputs['Random'], mz.inputs[0]); l.new(mz.outputs[0], rz.inputs[0]); l.new(rz.outputs[0], rv.inputs[2])
    coord = tc.outputs['Object']
    geo0 = n.new('ShaderNodeNewGeometry'); P = geo0.outputs['Position']
    an = n.new('ShaderNodeVectorMath'); an.operation = 'ABSOLUTE'; l.new(geo0.outputs['Normal'], an.inputs[0])
    pw = n.new('ShaderNodeVectorMath'); pw.operation = 'MULTIPLY'; l.new(an.outputs[0], pw.inputs[0]); l.new(an.outputs[0], pw.inputs[1])
    pw2 = n.new('ShaderNodeVectorMath'); pw2.operation = 'MULTIPLY'; l.new(pw.outputs[0], pw2.inputs[0]); l.new(pw.outputs[0], pw2.inputs[1])
    sw_ = n.new('ShaderNodeSeparateXYZ'); l.new(pw2.outputs[0], sw_.inputs[0])
    s1 = n.new('ShaderNodeMath'); s1.operation = 'ADD'; l.new(sw_.outputs[0], s1.inputs[0]); l.new(sw_.outputs[1], s1.inputs[1])
    s2 = n.new('ShaderNodeMath'); s2.operation = 'ADD'; l.new(s1.outputs[0], s2.inputs[0]); l.new(sw_.outputs[2], s2.inputs[1])
    W3 = []
    for i in range(3):
        dv_ = n.new('ShaderNodeMath'); dv_.operation = 'DIVIDE'; l.new(sw_.outputs[i], dv_.inputs[0]); l.new(s2.outputs[0], dv_.inputs[1]); W3.append(dv_.outputs[0])
    mn = n.new('ShaderNodeTexNoise'); mn.inputs['Scale'].default_value = 3.0; mn.inputs['Detail'].default_value = 4
    l.new(coord, mn.inputs['Vector'])
    dcol = dfac = fm = None
    if extra:
        mp = n.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / extra['sw'], 1 / extra['sh'], 1)
        l.new(coord, mp.inputs['Vector'])
        geo = n.new('ShaderNodeNewGeometry')
        dt = n.new('ShaderNodeVectorMath'); dt.operation = 'DOT_PRODUCT'; dt.inputs[1].default_value = (0, -1, 0)
        l.new(geo.outputs['True Normal'], dt.inputs[0])
        fm = n.new('ShaderNodeMapRange'); fm.inputs['From Min'].default_value = 0.80; fm.inputs['From Max'].default_value = 0.93
        l.new(dt.outputs['Value'], fm.inputs['Value'])
        if extra.get('relief'):
            ri = n.new('ShaderNodeTexImage'); ri.image = img_of(extra['relief'])
            ri.extension = 'EXTEND'; ri.interpolation = 'Cubic'; l.new(mp.outputs[0], ri.inputs['Vector'])
            bs = n.new('ShaderNodeMath'); bs.operation = 'MULTIPLY'; bs.inputs[1].default_value = extra.get('bump', 1.0)
            l.new(fm.outputs['Result'], bs.inputs[0])
            bp = n.new('ShaderNodeBump'); bp.inputs['Distance'].default_value = extra.get('bump_dist', 0.004)
            l.new(bs.outputs[0], bp.inputs['Strength']); l.new(ri.outputs['Color'], bp.inputs['Height'])
            l.new(bp.outputs['Normal'], p.inputs['Normal']); l.new(bp.outputs['Normal'], p.inputs['Coat Normal'])
        if extra.get('decor'):
            di = n.new('ShaderNodeTexImage'); di.image = img_of(extra['decor'], 'sRGB'); di.extension = 'CLIP'
            l.new(mp.outputs[0], di.inputs['Vector'])
            df = n.new('ShaderNodeMath'); df.operation = 'MULTIPLY'; l.new(di.outputs['Alpha'], df.inputs[0]); l.new(fm.outputs['Result'], df.inputs[1])
            dg = n.new('ShaderNodeMix'); dg.data_type = 'RGBA'; dg.blend_type = 'MULTIPLY'; dg.inputs['Factor'].default_value = 1.0
            l.new(di.outputs['Color'], dg.inputs[6]); dg.inputs[7].default_value = (*extra.get('decor_gain', (0.95, 0.95, 0.95)), 1)
            dcol, dfac = dg.outputs[2], df.outputs[0]
        if extra.get('photo'):
            # «блеск с фото»: отражения и резьба исходного фото (чёрный полированный камень) на лицевой грани стелы —
            # в post.py заменяют собственные блики рендера на лицевой грани (fw), во всех гранитах
            ph = n.new('ShaderNodeTexImage'); ph.image = img_of(extra['photo'], 'sRGB'); ph.extension = 'CLIP'; ph.interpolation = 'Cubic'
            l.new(mp.outputs[0], ph.inputs['Vector'])
            sb = n.new('ShaderNodeMix'); sb.data_type = 'RGBA'; sb.blend_type = 'SUBTRACT'; sb.inputs['Factor'].default_value = 1.0
            l.new(ph.outputs['Color'], sb.inputs[6]); sb.inputs[7].default_value = (*([extra.get('photo_floor', 0.004)] * 3), 1)
            gn = n.new('ShaderNodeMix'); gn.data_type = 'RGBA'; gn.blend_type = 'MULTIPLY'; gn.inputs['Factor'].default_value = 1.0; gn.clamp_result = True
            l.new(sb.outputs[2], gn.inputs[6]); gn.inputs[7].default_value = (*([extra.get('photo_gain', 1.0)] * 3), 1)
            w = n.new('ShaderNodeMath'); w.operation = 'MULTIPLY'; l.new(fm.outputs['Result'], w.inputs[0]); l.new(ph.outputs['Alpha'], w.inputs[1])
            if dfac is not None:
                inv = n.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; l.new(dfac, inv.inputs[1])
                w2 = n.new('ShaderNodeMath'); w2.operation = 'MULTIPLY'; l.new(w.outputs[0], w2.inputs[0]); l.new(inv.outputs[0], w2.inputs[1]); w = w2
            pc = n.new('ShaderNodeMix'); pc.data_type = 'RGBA'; pc.blend_type = 'MULTIPLY'; pc.inputs['Factor'].default_value = 1.0
            l.new(gn.outputs[2], pc.inputs[6]); l.new(w.outputs[0], pc.inputs[7])
            ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = 'pg'; l.new(pc.outputs[2], ao.inputs['Color'])
            ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = 'fw'; l.new(w.outputs[0], ao.inputs['Value'])
            if extra.get('cav'):
                cvi = n.new('ShaderNodeTexImage'); cvi.image = img_of(extra['cav']); cvi.extension = 'EXTEND'; cvi.interpolation = 'Cubic'
                l.new(mp.outputs[0], cvi.inputs['Vector'])
                cm_ = n.new('ShaderNodeMix'); cm_.data_type = 'FLOAT'; l.new(w.outputs[0], cm_.inputs['Factor']); cm_.inputs[2].default_value = 1.0
                l.new(cvi.outputs['Color'], cm_.inputs[3])
                ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = 'cv'; l.new(cm_.outputs[0], ao.inputs['Value'])
            else:
                ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = 'cv'; ao.inputs['Value'].default_value = 1.0
        else:
            zero_aovs(n, l)
    else:
        zero_aovs(n, l)
    cols = []
    for k, vid in enumerate(VARS):
        c = granite_tex(n, l, vid, rv.outputs[0], k, P, W3)
        if dcol is not None:
            mxd = n.new('ShaderNodeMix'); mxd.data_type = 'RGBA'; l.new(dfac, mxd.inputs['Factor']); l.new(c, mxd.inputs[6]); l.new(dcol, mxd.inputs[7]); c = mxd.outputs[2]
        cols.append(c)
        ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = 'g%d' % k; l.new(c, ao.inputs['Color'])
    l.new(cols[spec.get('base_variant', 0)], p.inputs['Base Color'])
    # полировка: лёгкая неоднородность шероховатости
    rr = n.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough * 0.7; rr.inputs['To Max'].default_value = rough * 1.4
    l.new(mn.outputs['Fac'], rr.inputs['Value'])
    if dfac is not None:
        rm = n.new('ShaderNodeMix'); rm.data_type = 'FLOAT'; l.new(dfac, rm.inputs['Factor']); l.new(rr.outputs['Result'], rm.inputs[2]); rm.inputs[3].default_value = 0.32
        l.new(rm.outputs[0], p.inputs['Roughness'])
    else:
        l.new(rr.outputs['Result'], p.inputs['Roughness'])
    p.inputs['IOR'].default_value = 1.55
    p.inputs['Coat Weight'].default_value = spec.get('coat', 0.25); p.inputs['Coat Roughness'].default_value = 0.03
    return m

def mat_gravel():
    m, n, l = new_mat('Gravel'); p = n['Principled BSDF']
    oi = n.new('ShaderNodeObjectInfo')
    rp = n.new('ShaderNodeValToRGB'); rp.color_ramp.elements[0].color = (0.42, 0.42, 0.41, 1); rp.color_ramp.elements[1].color = (0.80, 0.80, 0.78, 1)
    l.new(oi.outputs['Random'], rp.inputs['Fac'])
    l.new(rp.outputs['Color'], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.5
    for k in range(len(VARS)):
        ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = 'g%d' % k; l.new(rp.outputs['Color'], ao.inputs['Color'])
    zero_aovs(n, l)
    return m

def mat_ground():
    m, n, l = new_mat('Ground'); p = n['Principled BSDF']; p.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1); p.inputs['Roughness'].default_value = 0.9
    for k in range(len(VARS)):
        ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = 'g%d' % k; ao.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
    zero_aovs(n, l)
    return m

def mat_metal():
    # кованые вставки оград: чёрная окраска по металлу, одинаковая во всех гранитах
    m, n, l = new_mat('Iron'); p = n['Principled BSDF']; c = (0.022, 0.022, 0.021, 1)
    p.inputs['Base Color'].default_value = c; p.inputs['Roughness'].default_value = 0.3; p.inputs['Metallic'].default_value = 0.0
    for k in range(len(VARS)):
        ao = n.new('ShaderNodeOutputAOV'); ao.aov_name = 'g%d' % k; ao.inputs['Color'].default_value = c
    zero_aovs(n, l)
    return m

GM = mat_granite('Granite', spec.get('rough', 0.08)); GV = mat_gravel(); GD = mat_ground()

def link(ob):
    sc.collection.objects.link(ob); return ob
def select_only(ob):
    for o in bpy.context.view_layer.objects: o.select_set(False)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
def smooth(ob, ang=32):
    select_only(ob)
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(ang))
    except Exception as e: print('smooth fail', e)
def box(name, sx, sy, sz, cx, cy_, z0, mat, bw=0.0025):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector((v.co.x * sx + cx, v.co.y * sy + cy_, v.co.z * sz + z0 + sz / 2))
    bm.to_mesh(me); bm.free(); ob = link(bpy.data.objects.new(name, me)); ob.data.materials.append(mat)
    if bw:
        b = ob.modifiers.new('bev', 'BEVEL'); b.width = bw; b.segments = 3; b.limit_method = 'ANGLE'
    smooth(ob)
    return ob

if KIND == 'fence':  # ограды: геометрия из fencegeo.py по параметрам fencespec.py
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import fencegeo
    fencegeo.build(spec['fence'], {'GM': GM, 'MT': mat_metal(), 'link': link, 'smooth': smooth, 'box': box})
else:
    # ---------- стела ----------
    S = spec['stela']; SW = S['w']; ST = S['t']; BEV = S.get('bevel', 0.003)
    cu = bpy.data.curves.new('StelaC', 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = ST / 2 - BEV; cu.bevel_depth = BEV; cu.bevel_resolution = 3; cu.resolution_u = 1
    for poly in S['polys']:
        pts = poly['pts']
        sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, (x, y) in enumerate(pts): sp.points[i].co = (x * SW, y * SW, 0, 1)
        sp.use_cyclic_u = True
    SX = None
    if S.get('relief') or S.get('decor') or S.get('photo'):
        SX = mat_granite('GraniteS', spec.get('rough', 0.08), {'sw': SW, 'sh': S['aspect'] * SW, 'relief': S.get('relief'), 'decor': S.get('decor'),
                         'photo': S.get('photo'), 'cav': S.get('cav'), 'photo_gain': S.get('photo_gain', 1.0), 'photo_floor': S.get('photo_floor', 0.004),
                         'bump': S.get('bump', 1.0), 'bump_dist': S.get('bump_dist', 0.004)})
    so = link(bpy.data.objects.new('Stela', cu)); so.data.materials.append(SX or GM)
    select_only(so); bpy.ops.object.convert(target='MESH'); so = bpy.context.view_layer.objects.active
    T = spec['tumba']; TW, TD, TH = T['w'], T['d'], T['h']
    sx0 = T.get('stela_x', -SW / 2)
    so.rotation_euler = (math.radians(90), 0, 0); so.location = (sx0, T.get('stela_y', 0.0), TH - 0.002)
    smooth(so, 30)
    # ---------- тумба ----------
    box('Tumba', TW, TD, TH, 0, 0, 0, GM)
    # ---------- цветник ----------
    B = spec.get('bed')
    if B:
        BW, BL, BB, BH = B['w'], B['l'], B['b'], B['h']
        y0 = -TD / 2 - B.get('gap', 0.0); yf = y0 - BL
        box('BedL', BB, BL, BH, -BW / 2 + BB / 2, (y0 + yf) / 2, 0, GM)
        box('BedR', BB, BL, BH, BW / 2 - BB / 2, (y0 + yf) / 2, 0, GM)
        box('BedF', BW - 2 * BB - 0.001, BB, BH, 0, yf + BB / 2, 0, GM)
        if B.get('back', False): box('BedB', BW - 2 * BB - 0.001, BB, BH, 0, y0 - BB / 2, 0, GM)
        # крошка: базовая плоскость + камешки (geometry nodes)
        ix0, ix1 = -BW / 2 + BB, BW / 2 - BB; iy0, iy1 = yf + BB, y0 - (BB if B.get('back', False) else 0)
        zg = BH - B.get('drop', 0.014)
        rk = bpy.data.meshes.new('rock'); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=spec.get('rock_sub', 2), radius=0.0065)
        import random; random.seed(7)
        for v in bm.verts:
            v.co.x *= 1.15 + 0.25 * random.random(); v.co.z *= 0.62; v.co *= 0.85 + 0.3 * random.random()
        bm.to_mesh(rk); bm.free(); rock = bpy.data.objects.new('rock', rk); rk.materials.append(GV)
        for p in rk.polygons: p.use_smooth = False
        rcol = bpy.data.collections.new('hidden'); sc.collection.children.link(rcol); rcol.objects.link(rock); rcol.hide_render = True
        me = bpy.data.meshes.new('gbase'); me.from_pydata([(ix0, iy0, zg), (ix1, iy0, zg), (ix1, iy1, zg), (ix0, iy1, zg)], [], [(0, 1, 2, 3)])
        gb = link(bpy.data.objects.new('Gravel', me)); gb.data.materials.append(GV)
        ng = bpy.data.node_groups.new('GravelGN', 'GeometryNodeTree')
        ng.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
        ng.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
        N = ng.nodes; Lk = ng.links
        gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput'); jg = N.new('GeometryNodeJoinGeometry')
        oi = N.new('GeometryNodeObjectInfo'); oi.inputs['Object'].default_value = rock
        Lk.new(gi.outputs[0], jg.inputs[0])
        for li, (dmin, dz, seed) in enumerate([(0.0080, 0.0, 1), (0.0095, 0.0032, 5)]):
            dp = N.new('GeometryNodeDistributePointsOnFaces'); dp.distribute_method = 'POISSON'
            dp.inputs['Distance Min'].default_value = dmin; dp.inputs['Density Max'].default_value = 60000; dp.inputs['Seed'].default_value = seed
            rr = N.new('FunctionNodeRandomValue'); rr.data_type = 'FLOAT_VECTOR'; rr.inputs[0].default_value = (0, 0, 0); rr.inputs[1].default_value = (6.283, 6.283, 6.283); rr.inputs['Seed'].default_value = seed + 1
            rs = N.new('FunctionNodeRandomValue'); rs.data_type = 'FLOAT'; rs.inputs[2].default_value = 0.55; rs.inputs[3].default_value = 1.3; rs.inputs['Seed'].default_value = seed + 2
            ip = N.new('GeometryNodeInstanceOnPoints')
            tr = N.new('GeometryNodeTranslateInstances'); tr.inputs['Translation'].default_value = (0, 0, dz)
            Lk.new(gi.outputs[0], dp.inputs['Mesh']); Lk.new(dp.outputs['Points'], ip.inputs['Points'])
            Lk.new(oi.outputs['Geometry'], ip.inputs['Instance']); Lk.new(rr.outputs[0], ip.inputs['Rotation']); Lk.new(rs.outputs[1], ip.inputs['Scale'])
            Lk.new(ip.outputs['Instances'], tr.inputs['Instances']); Lk.new(tr.outputs['Instances'], jg.inputs[0])
        Lk.new(jg.outputs[0], go.inputs[0])
        md = gb.modifiers.new('gn', 'NODES'); md.node_group = ng

# ---------- земля (ловец теней) ----------
bpy.context.view_layer.update()
_gp = []
for o in sc.objects:
    if o.type == 'MESH' and o.name not in ('Gravel',):
        for c in o.bound_box: _gp.append(o.matrix_world @ Vector(c))
GM_ = spec.get('ground_margin', 0.45)
gx0 = min(p.x for p in _gp) - GM_; gx1 = max(p.x for p in _gp) + GM_ * 1.6; gy0 = min(p.y for p in _gp) - GM_; gy1 = max(p.y for p in _gp) + GM_ * 1.6
me = bpy.data.meshes.new('ground'); me.from_pydata([(gx0, gy0, 0), (gx1, gy0, 0), (gx1, gy1, 0), (gx0, gy1, 0)], [], [(0, 1, 2, 3)])
gr = link(bpy.data.objects.new('Ground', me)); gr.data.materials.append(GD); gr.is_shadow_catcher = True
gr.visible_glossy = False

# ---------- окружение: мягкое небо; для отражений — тёмный «пол» и светлый верх ----------
W = spec.get('world', {})
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear(); L = nt.links
tc = nt.nodes.new('ShaderNodeTexCoord'); sz = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Generated'], sz.inputs[0])
def ramp(stops):
    r = nt.nodes.new('ShaderNodeValToRGB'); e = r.color_ramp.elements
    e[0].position = stops[0][0]; e[0].color = (*stops[0][1], 1); e[1].position = stops[1][0]; e[1].color = (*stops[1][1], 1)
    for pos, col in stops[2:]:
        x = e.new(pos); x.color = (*col, 1)
    zz = nt.nodes.new('ShaderNodeMapRange'); zz.inputs['From Min'].default_value = -1; zz.inputs['From Max'].default_value = 1
    L.new(sz.outputs['Z'], zz.inputs['Value']); L.new(zz.outputs['Result'], r.inputs['Fac'])
    return r
# позиция в ramp: 0 = низ (z=-1), 0.5 = горизонт, 1 = зенит
amb = ramp(W.get('diffuse', [[0.0, (0.30, 0.30, 0.30)], [0.5, (0.75, 0.75, 0.76)], [1.0, (1.0, 1.0, 1.0)]]))
glo = ramp(W.get('glossy', [[0.0, (0.01, 0.01, 0.01)], [0.30, (0.012, 0.012, 0.012)], [0.44, (0.06, 0.06, 0.06)], [0.5, (0.25, 0.25, 0.26)], [0.62, (0.9, 0.9, 0.92)], [1.0, (1.3, 1.3, 1.3)]]))
lp = nt.nodes.new('ShaderNodeLightPath')
mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
L.new(lp.outputs['Is Glossy Ray'], mx.inputs['Factor']); L.new(amb.outputs['Color'], mx.inputs[6]); L.new(glo.outputs['Color'], mx.inputs[7])
bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = W.get('strength', 1.0)
wo = nt.nodes.new('ShaderNodeOutputWorld'); L.new(mx.outputs[2], bg.inputs['Color']); L.new(bg.outputs[0], wo.inputs['Surface'])

# ---------- солнце (мягкие тени назад-вправо) ----------
SUN = spec.get('sun', {'az': -35, 'el': 62, 'energy': 1.7, 'angle': 25})
if SUN and SUN.get('energy', 0) > 0:
    sl = bpy.data.lights.new('Sun', 'SUN'); sl.energy = SUN['energy']; sl.angle = math.radians(SUN['angle'])
    so_ = link(bpy.data.objects.new('Sun', sl))
    az, el = math.radians(SUN['az']), math.radians(SUN['el'])
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))  # направление НА солнце
    so_.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()

# ---------- камера: спереди-справа сверху, автоподгонка кадра ----------
C = spec.get('cam', {}); az, el = math.radians(C.get('az', 36)), math.radians(C.get('el', 24))
cam = bpy.data.cameras.new('Cam'); cam.lens = C.get('lens', 70); cam.sensor_width = 36; cam.sensor_fit = 'AUTO'
co = link(bpy.data.objects.new('Cam', cam)); sc.camera = co
bpy.context.view_layer.update()
pts = []
for o in sc.objects:
    if o.type == 'MESH' and o.name not in ('Ground',):
        if o.name == 'Gravel':
            continue
        dg = bpy.context.evaluated_depsgraph_get(); oe = o.evaluated_get(dg)
        for v in oe.data.vertices: pts.append(oe.matrix_world @ v.co)
mnv = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); mxv = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
ctr = (mnv + mxv) / 2; rad = (mxv - mnv).length / 2
dist = rad / math.tan(math.atan(18 / cam.lens)) * 1.15
dirv = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
co.location = ctr + dirv * dist; co.rotation_euler = (-dirv).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
from bpy_extras.object_utils import world_to_camera_view
uv = [world_to_camera_view(sc, co, p) for p in pts]
u0, u1 = min(p.x for p in uv), max(p.x for p in uv); v0, v1 = min(p.y for p in uv), max(p.y for p in uv)
fill = C.get('fill', 0.90); s = fill / max(u1 - u0, v1 - v0)
cam.lens *= s
cam.shift_x = ((u0 + u1) / 2 - 0.5) * s; cam.shift_y = ((v0 + v1) / 2 - 0.5) * s
cam.clip_start = 0.05; cam.clip_end = 50

# ---------- проходы для перекраски ----------
vl.use_pass_diffuse_direct = True; vl.use_pass_diffuse_indirect = True; vl.use_pass_diffuse_color = True
vl.use_pass_glossy_direct = True; vl.use_pass_glossy_indirect = True; vl.use_pass_glossy_color = True
vl.cycles.use_pass_shadow_catcher = True
vl.cycles.denoising_store_passes = True
sc.use_nodes = True; ct = sc.node_tree; ct.nodes.clear(); CL = ct.links
rl = ct.nodes.new('CompositorNodeRLayers')
def add(a, b, op='ADD'):
    m = ct.nodes.new('CompositorNodeMixRGB'); m.blend_type = op; m.use_alpha = False; m.inputs[0].default_value = 1
    CL.new(a, m.inputs[1]); CL.new(b, m.inputs[2]); return m.outputs[0]
def den(img):
    d = ct.nodes.new('CompositorNodeDenoise'); d.prefilter = 'ACCURATE'; d.use_hdr = True
    CL.new(img, d.inputs['Image']); CL.new(rl.outputs['Denoising Normal'], d.inputs['Normal']); CL.new(rl.outputs['Denoising Albedo'], d.inputs['Albedo'])
    return d.outputs[0]
dl = den(add(rl.outputs['DiffDir'], rl.outputs['DiffInd']))
gl = den(add(add(rl.outputs['GlossDir'], rl.outputs['GlossInd']), rl.outputs['GlossCol'], 'MULTIPLY'))
fo = ct.nodes.new('CompositorNodeOutputFile'); fo.base_path = OUT + '_'; fo.format.file_format = 'OPEN_EXR_MULTILAYER'; fo.format.color_depth = '16'; fo.format.exr_codec = 'ZIP'
fo.file_slots.clear()
def slot(name, sock):
    fo.file_slots.new(name); CL.new(sock, fo.inputs[name])
slot('Image', rl.outputs['Image']); slot('Alpha', rl.outputs['Alpha']); slot('DL', dl); slot('GL', gl)
slot('SC', rl.outputs['Shadow Catcher'])
for k in range(len(VARS)): slot('g%d' % k, rl.outputs['g%d' % k])
if PHOTO: slot('pg', rl.outputs['pg']); slot('fw', rl.outputs['fw']); slot('cv', rl.outputs['cv'])
cmp = ct.nodes.new('CompositorNodeComposite'); CL.new(rl.outputs['Image'], cmp.inputs['Image'])
sc.render.filepath = OUT + '.png'; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
import time; t0 = time.time()
bpy.ops.render.render(write_still=True)
print('RENDER_SEC %.1f' % (time.time() - t0))
json.dump({'variants': VARS, 'lens': cam.lens}, open(OUT + '.meta.json', 'w'))
