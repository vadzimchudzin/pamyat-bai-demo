# Ограды O1–O12: параметры моделей (метры) и сцена для build.py. Участок 2,0 × 1,8 м (X — фасад, Y — вглубь);
# столбы в углах и посередине сторон («mid») или только в углах («corner_only»); справа — проход у заднего угла,
# как на исходных фото каталога. O4 и O6 — четыре угловых элемента без пролётов. O11, O12 — с коваными вставками.
FENCES = {
    'O1': {'layout': 'mid', 'post': {'w': 0.14, 'h': 0.36}, 'fill': {'type': 'slab', 't': 0.08, 'prof': {'k': 'flat', 'h': 0.15}}},
    'O2': {'layout': 'mid', 'post': {'w': 0.16, 'h': 0.30}, 'fill': {'type': 'slab', 't': 0.07, 'z0': 0.09, 'prof': {'k': 'flat', 'h': 0.20}}},
    'O3': {'layout': 'mid', 'post': {'w': 0.12, 'h': 0.32}, 'fill': {'type': 'slab', 't': 0.05, 'prof': {'k': 'bell', 'h0': 0.21, 'h1': 0.30, 'e': 1.3}}},
    'O4': {'layout': 'corners', 'post': {'w': 0.09, 'h': 0.50}, 'ball': {'r': 0.042, 'plinth': {'w': 0.06, 'h': 0.02}},
           'arm': {'len': 0.55, 't': 0.05, 'prof': {'k': 'swoop', 'h0': 0.20, 'h1': 0.46, 'w': 0.8}}},
    'O5': {'layout': 'mid', 'post': {'w': 0.13, 'h': 0.20}, 'fill': {'type': 'slab', 't': 0.09, 'bev': 0.018, 'prof': {'k': 'bell', 'h0': 0.18, 'h1': 0.245, 'e': 1.6}}},
    'O6': {'layout': 'corners', 'post': {'w': 0.11, 'h': 0.295}, 'arm': {'len': 0.55, 't': 0.10, 'bev': 0.008, 'prof': {'k': 'rise', 'h0': 0.10, 'h1': 0.28, 'e': 2.2}}},
    'O7': {'layout': 'mid', 'post': {'w': 0.13, 'h': 0.30}, 'fill': {'type': 'slab', 't': 0.06, 'prof': {'k': 'dip', 'h0': 0.10, 'h1': 0.26, 'e': 0.6}}},
    'O8': {'layout': 'mid', 'post': {'w': 0.14, 'h': 0.46}, 'cap': {'w': 0.18, 'h': 0.035}, 'ball': {'r': 0.048, 'plinth': {'w': 0.075, 'h': 0.022}},
           'fill': {'type': 'slab', 't': 0.06, 'prof': {'k': 'dip', 'h0': 0.27, 'h1': 0.40, 'e': 0.9}}},
    'O9': {'layout': 'corner_only', 'post': {'w': 0.14, 'h': 0.42}, 'fill': {'type': 'slab', 't': 0.07, 'prof': {'k': 'flat', 'h': 0.36}}},
    'O10': {'layout': 'mid', 'post': {'w': 0.14, 'h': 0.38}, 'fill': {'type': 'slab', 't': 0.06, 'z0': 0.17, 'prof': {'k': 'flat', 'h': 0.27}}},
    'O11': {'layout': 'corner_only', 'post': {'w': 0.16, 'h': 0.56}, 'fill': {'type': 'iron11', 'base': {'t': 0.10, 'h': 0.12}}},
    'O12': {'layout': 'mid', 'post': {'w': 0.16, 'h': 0.56}, 'fill': {'type': 'iron12'}},
}

def is_fence(code):
    return code in FENCES

def fence_spec(code, out_prefix, res=2000, samples=20, **kw):
    sp = {'code': code, 'kind': 'fence', 'out': out_prefix, 'res': res, 'samples': samples, 'fence': FENCES[code],
          'cam': {'az': 46, 'el': 23, 'lens': 70, 'fill': 0.92}, 'ground_margin': 0.35,
          # светлый «пол» в отражениях: вертикальные грани полированного камня не проваливаются в черноту
          'world': {'glossy': [[0.0, (0.24, 0.24, 0.24)], [0.30, (0.40, 0.40, 0.40)], [0.45, (0.55, 0.55, 0.56)], [0.5, (0.66, 0.66, 0.67)],
                               [0.62, (0.9, 0.9, 0.92)], [1.0, (1.3, 1.3, 1.3)]]}}
    sp.update(kw)
    return sp
