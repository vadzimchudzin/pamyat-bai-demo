# Упаковка растров в SVG (WebP внутри data-URI): текстовый файл, который можно коммитить как обычный текст.
#   python3 pack-svg.py lamp <render_dir> <out_dir>   — лампада: обрезка по силуэту, два слоя + геометрия пламени
#   python3 pack-svg.py marble <png> <out_svg> [q]    — мраморный фон «Примеров работ» (q — качество WebP, по умолчанию 90)
import sys, os, io, json, base64
from PIL import Image

def webp_b64(im, **kw):
    b = io.BytesIO(); im.save(b, 'WEBP', method=6, **kw); return base64.b64encode(b.getvalue()).decode(), b.tell()

def svg(w, h, b64):
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="%d" height="%d" viewBox="0 0 %d %d">'
            '<image width="%d" height="%d" xlink:href="data:image/webp;base64,%s"/></svg>\n') % (w, h, w, h, w, h, b64)

mode = sys.argv[1]
if mode == 'lamp':
    src, out = sys.argv[2], sys.argv[3]
    base = Image.open(os.path.join(src, 'base.png')).convert('RGBA')
    light = Image.open(os.path.join(src, 'light.png')).convert('RGB')
    g = json.load(open(os.path.join(src, 'lamp.json')))
    bb = base.getbbox(); lb = light.convert('L').point(lambda v: 255 if v > 2 else 0).getbbox()
    m = 6
    box = (max(0, min(bb[0], lb[0]) - m), max(0, min(bb[1], lb[1]) - m), min(base.width, max(bb[2], lb[2]) + m), min(base.height, max(bb[3], lb[3]) + m))
    base, light = base.crop(box), light.crop(box)
    W, H = base.size
    b1, n1 = webp_b64(base, quality=88, alpha_quality=92)
    b2, n2 = webp_b64(light, quality=88)
    open(os.path.join(out, 'lamp-base.svg'), 'w').write(svg(W, H, b1))
    open(os.path.join(out, 'lamp-light.svg'), 'w').write(svg(W, H, b2))
    fx, fy = (g['flame'][0] - box[0]) / W, (g['flame'][1] - box[1]) / H
    by = (bb[3] - box[1]) / H
    print(json.dumps({'w': W, 'h': H, 'fx': round(fx, 4), 'fy': round(fy, 4), 'baseY': round(by, 4), 'bytes': [n1, n2]}))
elif mode == 'marble':
    im = Image.open(sys.argv[2]).convert('RGB')
    b, n = webp_b64(im, quality=int(sys.argv[4]) if len(sys.argv) > 4 else 90)
    open(sys.argv[3], 'w').write(svg(im.width, im.height, b))
    print('marble', im.size, n, os.path.getsize(sys.argv[3]))
