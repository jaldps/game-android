#!/usr/bin/env python3
"""Blind A/B composite. Usage: tools/blind.py ours.png reference.jpg out_dir/name [--crop x0,y0,x1,y1]  (crop = fractions 0..1 of the REFERENCE, e.g. 0.33,0,0.67,1 to cut a portrait gameplay strip out of a 16:9 YouTube frame)
Writes out_dir/name.png (side-by-side, labelled only 'A' and 'B', random order, both letterboxed to equal height on neutral grey)
and out_dir/.name.key (which side is ours). Judges must NOT read the .key file until after giving a verdict."""
import sys, random, os
from PIL import Image, ImageDraw, ImageFont
ours, ref, out = sys.argv[1], sys.argv[2], sys.argv[3]
crop = sys.argv[sys.argv.index('--crop')+1].split(',') if '--crop' in sys.argv else None
H = 1000
def load(p):
    im = Image.open(p).convert('RGB')
    # crop letterbox/pillarbox bars (near-black borders, common in YouTube frames of portrait games)
    g = im.convert('L').point(lambda v: 255 if v > 18 else 0); bb = g.getbbox()
    if bb and (bb[2]-bb[0]) > im.width*0.2 and (bb[3]-bb[1]) > im.height*0.2: im = im.crop(bb)
    return im
A0, B0 = load(ours), load(ref)
if crop:
    c=[float(v) for v in crop]; B0 = B0.crop((int(c[0]*B0.width), int(c[1]*B0.height), int(c[2]*B0.width), int(c[3]*B0.height)))
# equalize detail: both images degraded to the lower of the two native heights before upscaling, so resolution is not a giveaway
native = min(A0.height, B0.height)
def fit(im):
    w, h = im.size; s = native / h; im = im.resize((max(1, int(w * s)), native), Image.LANCZOS)
    s2 = H / native; return im.resize((max(1, int(im.width * s2)), H), Image.LANCZOS)
a, b = fit(A0), fit(B0)
swap = random.random() < 0.5
L, R = (b, a) if swap else (a, b)
pad = 40
canvas = Image.new('RGB', (L.width + R.width + pad * 3, H + pad * 2 + 60), (60, 60, 64))
canvas.paste(L, (pad, pad + 60)); canvas.paste(R, (L.width + pad * 2, pad + 60))
d = ImageDraw.Draw(canvas)
try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 48)
except Exception: f = ImageFont.load_default()
d.text((pad, 10), 'A', fill=(255, 255, 255), font=f); d.text((L.width + pad * 2, 10), 'B', fill=(255, 255, 255), font=f)
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
canvas.save(out + '.png')
open(os.path.join(os.path.dirname(out) or '.', '.' + os.path.basename(out) + '.key'), 'w').write('ours=' + ('B' if swap else 'A') + '\n')
print('wrote', out + '.png')
