#!/usr/bin/env python3
# 3D-рендер каталога: контур с фото → рельеф/декор → сцена Blender (Cycles) → 5 вариантов гранита из одного рендера.
# python3 run.py --src <папка с фото кодов> --work <tmp> --out <dist> --blender <bin> [--codes "B4 H5"|all] [--shard k/n]
import argparse, json, os, re, shutil, subprocess, sys, time, glob
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from outline import outline
from relief import maps
from mkspec import spec_for, relief_family
from PIL import Image
FAM = 'ABCDEFHIP'  # вертикальные, горизонтальные, кресты; комплексы/ограды/аксессуары — фото

def nat(c): return (c[0], int(re.sub(r'\D', '', c) or 0))

def all_codes(src):
    return sorted([f[:-5] for f in os.listdir(src) if re.fullmatch(r'[%s]\d+\.webp' % FAM, f)], key=nat)

def pick(src, codes, shard):
    allc = all_codes(src)
    cs = allc if codes.strip() in ('', 'all') else [c for c in re.split(r'[\s,]+', codes.strip()) if c in allc]
    k, n = map(int, shard.split('/'))
    return cs[k::n]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True); ap.add_argument('--work', default='/tmp/r3d'); ap.add_argument('--out', default='dist')
    ap.add_argument('--blender', default='blender'); ap.add_argument('--codes', default='all'); ap.add_argument('--shard', default='0/1')
    ap.add_argument('--res', type=int, default=1000); ap.add_argument('--spp', type=int, default=20)
    ap.add_argument('--list', action='store_true'); ap.add_argument('--timeout', type=int, default=1800); ap.add_argument('--tag', default='')
    a = ap.parse_args()
    codes = pick(a.src, a.codes, a.shard)
    if a.list:
        print(' '.join(codes)); return
    ids = [g['id'] for g in json.load(open(os.path.join(HERE, 'granites.json')))]
    bdir = os.path.dirname(os.path.realpath(a.blender))
    bpy3 = (glob.glob(os.path.join(bdir, '*', 'python', 'bin', 'python3*')) or [None])[0]
    ol = os.path.join(a.work, 'ol'); rd = os.path.join(a.work, 'r'); stage = os.path.join(a.work, 'stage')
    for d in (ol, rd, stage, os.path.join(a.out, 'sm'), os.path.join(a.out, '_log')): os.makedirs(d, exist_ok=True)
    log = []
    for code in codes:
        t0 = time.time(); rec = {'code': code}
        try:
            o = outline(os.path.join(a.src, code + '.webp'), code, ol, dbg=False)
            if relief_family(code): rec['decor'] = round(maps(code, ol), 3)
            sp = spec_for(code, ol, os.path.join(rd, code), a.res, a.spp, variants=ids)
            spp = os.path.join(rd, code + '.spec.json'); json.dump(sp, open(spp, 'w'))
            exr = os.path.join(rd, code + '_0001.exr')
            if os.path.exists(exr): os.remove(exr)
            r = subprocess.run([a.blender, '-b', '--factory-startup', '-noaudio', '--python', os.path.join(HERE, 'build.py'), '--', spp],
                               capture_output=True, text=True, timeout=a.timeout)
            m = re.search(r'RENDER_SEC ([\d.]+)', r.stdout)
            if not os.path.exists(exr):
                raise RuntimeError('render failed: ' + (r.stdout + r.stderr)[-1500:])
            rec['render'] = float(m.group(1)) if m else None
            # варианты пишутся во временную папку и попадают в --out только полным набором (все граниты, оба размера):
            # сбой посреди модели не оставит в каталоге смесь новых и старых рендеров
            sd = os.path.join(stage, code); shutil.rmtree(sd, ignore_errors=True); os.makedirs(sd)
            p = subprocess.run([bpy3, os.path.join(HERE, 'post.py'), exr, sd, code, json.dumps(ids)], capture_output=True, text=True, timeout=600)
            if p.returncode: raise RuntimeError('post failed: ' + (p.stdout + p.stderr)[-1500:])
            want = [(os.path.join(sub, '%s-%s.webp' % (code, v)), a.res // (2 if sub else 1)) for v in ids for sub in ('', 'sm')]
            for f, px in want:
                with Image.open(os.path.join(sd, f)) as im:
                    if im.size != (px, px): raise RuntimeError('post: %s is %dx%d, want %d' % (f, im.size[0], im.size[1], px))
            for f, _ in want: shutil.move(os.path.join(sd, f), os.path.join(a.out, f))
            shutil.rmtree(sd, ignore_errors=True)
            rec['recon'] = p.stdout.strip().split()[-1] if p.stdout.strip() else None
            os.remove(exr)
            for f in glob.glob(os.path.join(rd, code + '.png')): os.remove(f)
            rec['ok'] = True
        except Exception as e:
            rec['ok'] = False; rec['err'] = str(e)[-1500:]
        rec['sec'] = round(time.time() - t0, 1); log.append(rec)
        print(json.dumps(rec, ensure_ascii=False)[:600], flush=True)
    json.dump(log, open(os.path.join(a.out, '_log', 'shard-%s.json' % (a.tag or a.shard.replace('/', 'of'))), 'w'), ensure_ascii=False, indent=1)
    bad = [r['code'] for r in log if not r.get('ok')]
    if bad:  # шард «красный»; готовые модели всё равно публикуются (commit-джоб), упавшие остаются со старыми рендерами
        print('FAILED: ' + ' '.join(bad), file=sys.stderr); sys.exit(1)

if __name__ == '__main__':
    main()
