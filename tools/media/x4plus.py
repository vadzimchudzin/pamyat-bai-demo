#!/usr/bin/env python3
# ПАМЯТЬ.БАЙ — Real-ESRGAN x4plus (RRDBNet, 23 блока) на CPU через PyTorch, без basicsr.
# Запускается в workflow catalog-x4plus.yml:
#   python3 x4plus.py <RealESRGAN_x4plus.pth> <in_dir> <out_dir> [tile]
# Каждый <code>.png из in_dir → out_dir/<code>.png (×4). Плитки с перекрытием 16 px — без швов.
import os, sys, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image


class RDB(nn.Module):
    def __init__(s, nf=64, gc=32):
        super().__init__()
        s.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        s.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        s.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        s.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        s.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        s.lrelu = nn.LeakyReLU(0.2, True)

    def forward(s, x):
        x1 = s.lrelu(s.conv1(x))
        x2 = s.lrelu(s.conv2(torch.cat((x, x1), 1)))
        x3 = s.lrelu(s.conv3(torch.cat((x, x1, x2), 1)))
        x4 = s.lrelu(s.conv4(torch.cat((x, x1, x2, x3), 1)))
        return s.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x


class RRDB(nn.Module):
    def __init__(s, nf=64, gc=32):
        super().__init__()
        s.rdb1, s.rdb2, s.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

    def forward(s, x):
        return s.rdb3(s.rdb2(s.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(s, nb=23, nf=64, gc=32):
        super().__init__()
        s.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        s.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        s.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        s.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        s.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        s.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        s.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        s.lrelu = nn.LeakyReLU(0.2, True)

    def forward(s, x):
        f = s.conv_first(x)
        f = f + s.conv_body(s.body(f))
        f = s.lrelu(s.conv_up1(F.interpolate(f, scale_factor=2, mode='nearest')))
        f = s.lrelu(s.conv_up2(F.interpolate(f, scale_factor=2, mode='nearest')))
        return s.conv_last(s.lrelu(s.conv_hr(f)))


def load(path):
    m = RRDBNet()
    sd = torch.load(path, map_location='cpu', weights_only=True)
    sd = sd.get('params_ema', sd.get('params', sd))
    m.load_state_dict(sd, strict=True)
    return m.eval()


@torch.inference_mode()
def upscale(m, img, tile=320, pad=16):
    x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.).permute(2, 0, 1)[None]
    _, _, H, W = x.shape
    out = torch.zeros(1, 3, H * 4, W * 4)
    for y0 in range(0, H, tile):
        for x0 in range(0, W, tile):
            y1, x1 = min(y0 + tile, H), min(x0 + tile, W)
            ya, xa, yb, xb = max(y0 - pad, 0), max(x0 - pad, 0), min(y1 + pad, H), min(x1 + pad, W)
            o = m(x[:, :, ya:yb, xa:xb])
            oy, ox = (y0 - ya) * 4, (x0 - xa) * 4
            out[:, :, y0 * 4:y1 * 4, x0 * 4:x1 * 4] = o[:, :, oy:oy + (y1 - y0) * 4, ox:ox + (x1 - x0) * 4]
    return Image.fromarray((out[0].clamp(0, 1).permute(1, 2, 0).numpy() * 255 + 0.5).astype(np.uint8))


def main():
    weights, src, dst = sys.argv[1:4]
    tile = int(sys.argv[4]) if len(sys.argv) > 4 else 320
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    os.makedirs(dst, exist_ok=True)
    m = load(weights)
    files = sorted(f for f in os.listdir(src) if f.lower().endswith('.png'))
    for f in files:
        t = time.time()
        im = Image.open(os.path.join(src, f)).convert('RGBA')
        im = Image.alpha_composite(Image.new('RGBA', im.size, (255, 255, 255, 255)), im).convert('RGB')
        upscale(m, im, tile).save(os.path.join(dst, f))
        print(f, im.size, '→ x4', round(time.time() - t, 1), 's', flush=True)
    print('done', len(files))


if __name__ == '__main__':
    main()
