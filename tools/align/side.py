"""Side-by-side crops (arena | real) of the HUD regions: uv run --with pillow tools/align/side.py arena.png real.jpg out.png"""
import sys
from PIL import Image
a = Image.open(sys.argv[1]).convert("RGB")
b = Image.open(sys.argv[2]).convert("RGB")
rows = []
for box in [(0, 0, 330, 150), (0, 150, 130, 285), (0, 590, 660, 720), (870, 45, 1270, 160), (900, 520, 1260, 590), (1010, 590, 1200, 710), (440, 260, 600, 420)]:
    x, y = a.crop(box), b.crop(box)
    s = 2 if box[2] - box[0] < 400 else 1
    w, hh = x.width * s, x.height * s
    im = Image.new("RGB", (w * 2 + 10, hh), (255, 0, 255))
    im.paste(x.resize((w, hh), Image.NEAREST), (0, 0))
    im.paste(y.resize((w, hh), Image.NEAREST), (w + 10, 0))
    rows.append(im)
W = max(r.width for r in rows)
H = sum(r.height + 8 for r in rows)
o = Image.new("RGB", (W, H), (30, 0, 30))
yy = 0
for r in rows:
    o.paste(r, (0, yy))
    yy += r.height + 8
o.save(sys.argv[3])
