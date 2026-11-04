#!/usr/bin/env python3
# Манифест 3D-каталога, листы и журнал: python3 manifest.py <assets/catalog/3d> <run_id> [log_dir] [raw_log_dir]
# Код попадает в манифест, только если есть все варианты в обоих размерах.
import json, os, re, sys, glob
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
d, run = sys.argv[1], sys.argv[2]; logd = sys.argv[3] if len(sys.argv) > 3 else None; raw = sys.argv[4] if len(sys.argv) > 4 else None
G = json.load(open(os.path.join(HERE, 'granites.json')))
ids = [g['id'] for g in G]
def nat(c): return (c[0], int(re.sub(r'\D', '', c) or 0))
codes = sorted({m.group(1) for f in os.listdir(d) for m in [re.fullmatch(r'([A-Z]\d+)-[a-z]+\.webp', f)] if m}, key=nat)
ok = [c for c in codes if all(os.path.exists(os.path.join(d, p, '%s-%s.webp' % (c, v))) for v in ids for p in ('', 'sm'))]
man = {'v': str(run), 'res': Image.open(os.path.join(d, '%s-%s.webp' % (ok[0], ids[0]))).size[0] if ok else 0,
       'variants': [{'id': g['id'], 'name': g['name'], 'swatch': g['swatch']} for g in G], 'codes': ok}
json.dump(man, open(os.path.join(d, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('codes', len(ok), 'incomplete', sorted(set(codes) - set(ok)))
if logd:  # листы: по 60 изделий, вариант = номер по кругу
    os.makedirs(logd, exist_ok=True)
    for f in glob.glob(os.path.join(logd, 'sheet-*.jpg')): os.remove(f)
    T = 160
    for s in range(0, len(ok), 60):
        ch = ok[s:s + 60]; sh = Image.new('RGB', (10 * T, ((len(ch) + 9) // 10) * (T + 14)), 'white'); dr = ImageDraw.Draw(sh)
        for i, c in enumerate(ch):
            im = Image.open(os.path.join(d, 'sm', '%s-%s.webp' % (c, ids[(s + i) % len(ids)]))).convert('RGB').resize((T, T), Image.LANCZOS)
            x, y = (i % 10) * T, (i // 10) * (T + 14); sh.paste(im, (x, y + 14)); dr.text((x + 3, y + 1), c, fill=(0, 0, 0))
        sh.save(os.path.join(logd, 'sheet-%d.jpg' % (s // 60)), quality=78)
    # журнал запуска: что отрендерено, ошибки, время
    recs = []
    for f in sorted(glob.glob(os.path.join(raw or '', 'shard-*.json'))) if raw else []:
        try: recs += json.load(open(f))
        except Exception: pass
    good = [r for r in recs if r.get('ok')]; bad = [r for r in recs if not r.get('ok')]
    rs = [r['render'] for r in good if r.get('render')]
    with open(os.path.join(logd, 'last-run.txt'), 'w') as fh:
        fh.write('run %s: ok %d, failed %d, render avg %.1fs max %.1fs\n' % (run, len(good), len(bad), sum(rs) / max(1, len(rs)), max(rs or [0])))
        fh.write('in manifest: %d codes\n' % len(ok))
        for r in bad: fh.write('FAIL %s: %s\n' % (r['code'], (r.get('err') or '')[-700:].replace('\n', ' | ')))
        for r in good: fh.write('%s %ss%s\n' % (r['code'], r.get('render'), (' decor %s' % r['decor']) if r.get('decor') else ''))
