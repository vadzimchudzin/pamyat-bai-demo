#!/usr/bin/env python3
# 3D-рендер каталога: контур с фото → рельеф/декор → сцена Blender (Cycles) → 5 вариантов гранита из одного рендера.
# python3 run.py --src <папка с фото кодов> --work <tmp> --out <dist> --blender <bin> [--codes "B4 H5"|all] [--shard k/n]
import argparse, json, os, re, shutil, subprocess, sys, time, glob
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from outline import outline
from relief import maps
from mkspec import spec_for, relief_family
from photo import photo_maps
from fencespec import FENCES, fence_spec
from fixes import patched  # перерисовка нечитаемого мелкого декора (F18)
from PIL import Image
import texsynth
FAM = 'ABCDEFHIP'  # вертикальные, горизонтальные, кресты — по контуру с фото; ограды O1–O12 — по параметрам (fencespec.py);
# комплексы и аксессуары остаются фото

def nat(c): return (c[0], int(re.sub(r'\D', '', c) or 0))

def all_codes(src):
    return sorted([f[:-5] for f in os.listdir(src) if re.fullmatch(r'[%s]\d+\.webp' % FAM, f)] + list(FENCES), key=nat)

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
    ap.add_argument('--fres', type=int, default=2000)  # ограды — крупнее: их рассматривают с увеличением
    ap.add_argument('--list', action='store_true'); ap.add_argument('--timeout', type=int, default=1800); ap.add_argument('--tag', default='')
    a = ap.parse_args()
    codes = pick(a.src, a.codes, a.shard)
    if a.list:
        print(' '.join(codes)); return
    G = json.load(open(os.path.join(HERE, 'granites.json'))); ids = [g['id'] for g in G]
    # бесшовные плитки гранита из фото образцов (детерминированно, один раз на запуск)
    td = os.path.join(a.work, 'tex'); tex = {}
    for g in G:
        f = os.path.join(td, g['id'] + '.png')
        px = texsynth.make(g['id'], td, g.get('tex', {})) if not os.path.exists(f) else texsynth.cv2.imread(f, -1).shape[0]
        tex[g['id']] = {'path': f, 'size_m': round(px * g.get('tex', {}).get('mpp', 0.0005), 4)}
    os.makedirs(os.path.join(a.out, 'sw'), exist_ok=True)  # образцы камня для сайта
    for g in G:
        sw = os.path.join(td, 'sw', g['id'] + '.jpg')
        if os.path.exists(sw): shutil.copy(sw, os.path.join(a.out, 'sw', g['id'] + '.jpg'))
    bdir = os.path.dirname(os.path.realpath(a.blender))
    bpy3 = (glob.glob(os.path.join(bdir, '*', 'python', 'bin', 'python3*')) or [None])[0]
    ol = os.path.join(a.work, 'ol'); rd = os.path.join(a.work, 'r'); stage = os.path.join(a.work, 'stage')
    for d in (ol, rd, stage, os.path.join(a.out, 'sm'), os.path.join(a.out, '_log')): os.makedirs(d, exist_ok=True)
    log = []
    for code in codes:
        t0 = time.time(); rec = {'code': code}
        try:
            res = a.fres if code in FENCES else a.res
            if code in FENCES:
                sp = fence_spec(code, os.path.join(rd, code), res, a.spp, variants=ids, tex=tex)
            else:
                o = outline(patched(os.path.join(a.src, code + '.webp'), code, os.path.join(a.work, 'fix')), code, ol, dbg=False)
                rec['side'] = photo_maps(code, ol)  # лицевая грань (photo.png) нужна relief.maps — вызываем первым
                rec['decor'] = round(maps(code, ol, relief=relief_family(code)), 3)  # рельеф и светлая резьба — у семейств с резьбой
                sp = spec_for(code, ol, os.path.join(rd, code), res, a.spp, variants=ids, tex=tex)
            # крупный кадр — 4 части с перекрытием (память: 5 гранитов × проходы × шумодав), post.py сшивает
            S, MG = res // 2, 64
            regs = [[x0, y0, x1, y1] for y0, y1 in ((0, S + MG), (S - MG, res)) for x0, x1 in ((0, S + MG), (S - MG, res))] if res > 1400 else [None]
            exrs, sec = [], 0.0
            for i, rg in enumerate(regs):
                spi = dict(sp, out=sp['out'] + ('.p%d' % i if rg else ''))
                if rg: spi['region'] = rg
                spp = os.path.join(rd, code + ('.p%d' % i if rg else '') + '.spec.json'); json.dump(spi, open(spp, 'w'))
                exr = spi['out'] + '_0001.exr'
                if os.path.exists(exr): os.remove(exr)
                r = subprocess.run([a.blender, '-b', '--factory-startup', '-noaudio', '--python', os.path.join(HERE, 'build.py'), '--', spp],
                                   capture_output=True, text=True, timeout=a.timeout)
                m = re.search(r'RENDER_SEC ([\d.]+)', r.stdout)
                if not os.path.exists(exr):
                    raise RuntimeError('render failed%s: ' % (' (part %d)' % i if rg else '') + (r.stdout + r.stderr)[-1500:])
                sec += float(m.group(1)) if m else 0.0; exrs.append(exr)
            rec['render'] = round(sec, 1)
            src_arg = exrs[0] if regs[0] is None else json.dumps({'res': res, 'm': MG, 'parts': [[f, rg[0], rg[1]] for f, rg in zip(exrs, regs)]})
            # варианты пишутся во временную папку и попадают в --out только полным набором (все граниты, оба размера):
            # сбой посреди модели не оставит в каталоге смесь новых и старых рендеров
            sd = os.path.join(stage, code); shutil.rmtree(sd, ignore_errors=True); os.makedirs(sd)
            p = subprocess.run([bpy3, os.path.join(HERE, 'post.py'), src_arg, sd, code, json.dumps(ids)], capture_output=True, text=True, timeout=900)
            if p.returncode: raise RuntimeError('post failed: ' + (p.stdout + p.stderr)[-1500:])
            want = [(os.path.join(sub, '%s-%s.webp' % (code, v)), res // (2 if sub else 1)) for v in ids for sub in ('', 'sm')]
            for f, px in want:
                with Image.open(os.path.join(sd, f)) as im:
                    if im.size != (px, px): raise RuntimeError('post: %s is %dx%d, want %d' % (f, im.size[0], im.size[1], px))
            for f, _ in want: shutil.move(os.path.join(sd, f), os.path.join(a.out, f))
            shutil.rmtree(sd, ignore_errors=True)
            rec['recon'] = p.stdout.strip().split()[-1] if p.stdout.strip() else None
            if not os.environ.get('R3D_KEEP'):
                for f in exrs: os.remove(f)
            for f in glob.glob(os.path.join(rd, code + '.png')) + glob.glob(os.path.join(rd, code + '.p?.png')): os.remove(f)
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
