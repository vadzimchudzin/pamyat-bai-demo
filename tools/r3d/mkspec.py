# Параметры сцены по контуру: стела (контур, толщина 6 см), тумба по замеру с фото, цветник с крошкой, камера
import json, os

def relief_family(code):
    return code[0] in 'DEFI' or code in ('C25',)

def spec_for(code, ol_dir, out_prefix, res=1000, samples=20, **kw):
    o = json.load(open(os.path.join(ol_dir, code + '.json')))
    t = o['tumba']; l, r = t['l'], t['r']
    if code[0] in 'HI':  # горизонтальные: стела 100 × 60, цветник 50 × 60 по ширине тумбы
        SW = 1.0; TW = max(round((r - l) * SW * 0.97, 3), SW * 1.02)
        bed = {'w': TW, 'l': 0.60, 'b': 0.06, 'h': 0.08}
    else:  # вертикальные и кресты: стела 100 × 50, цветник 100 × 50
        SW = 0.50; TW = min(max(round((r - l - 0.04) * SW, 3), SW * 1.12), SW * 1.25)
        bed = {'w': TW, 'l': 1.00, 'b': 0.06, 'h': 0.08}
    c = (l + r) / 2
    stela_x = -SW / 2 if abs(c - 0.5) < 0.04 else -TW / 2 + (-l) * SW
    sp = {'code': code, 'out': out_prefix, 'res': res, 'samples': samples,
          'stela': {'w': SW, 't': 0.06, 'polys': o['polys'], 'aspect': o['aspect']},
          'tumba': {'w': TW, 'd': 0.20, 'h': 0.15, 'stela_x': stela_x},
          'bed': bed, 'cam': {'az': 25, 'el': 21, 'lens': 45, 'fill': 0.9}}
    if relief_family(code):
        sp['stela']['relief'] = os.path.join(ol_dir, code + '-relief.png')
        dp = os.path.join(ol_dir, code + '-decor.png')
        if os.path.exists(dp): sp['stela']['decor'] = dp
    sp.update(kw)
    return sp
