"""
Find where FTL UI art sits in a real screenshot: masked sum-of-squared-differences via FFT.
    uv run --with pillow --with numpy tools/align/match.py traces/real/212680_111.jpg assets-local/img piece.png [...]
Prints best (x, y) and the mean error per opaque pixel for each piece.
"""
import sys
import numpy as np
from PIL import Image

def fft_corr(a, b):
    # correlation of a (H,W) with kernel b (h,w): out[y,x] = sum b[j,i]*a[y+j,x+i]
    H, W = a.shape
    h, w = b.shape
    fa = np.fft.rfft2(a, s=(H, W))
    fb = np.fft.rfft2(b[::-1, ::-1], s=(H, W))
    c = np.fft.irfft2(fa * fb, s=(H, W))
    return c[h - 1:H, w - 1:W]

def match(shot, piece, region=None):
    I = np.asarray(shot, dtype=np.float64) / 255.0
    P = np.asarray(piece.convert("RGBA"), dtype=np.float64) / 255.0
    m = (P[:, :, 3] > 0.85).astype(np.float64)
    if m.sum() < 20:
        return None
    ox = oy = 0
    if region:
        x0, y0, x1, y1 = region
        x1 = max(x1, x0 + P.shape[1] + 1)
        y1 = max(y1, y0 + P.shape[0] + 1)
        x1, y1 = min(x1, I.shape[1]), min(y1, I.shape[0])
        I = I[y0:y1, x0:x1]
        ox, oy = x0, y0
    ssd = 0
    for ch in range(3):
        T = P[:, :, ch] * m
        Ic = I[:, :, ch]
        ssd = ssd + fft_corr(Ic * Ic, m) - 2 * fft_corr(Ic, T) + (T * T).sum()
    ssd /= m.sum() * 3
    y, x = np.unravel_index(np.argmin(ssd), ssd.shape)
    return x + ox, y + oy, float(ssd[y, x])

if __name__ == "__main__":
    shot = Image.open(sys.argv[1]).convert("RGB")
    root = sys.argv[2]
    for name in sys.argv[3:]:
        region = None
        if "@" in name:
            name, r = name.split("@")
            region = tuple(int(v) for v in r.split(","))
        try:
            r = match(shot, Image.open(f"{root}/{name}"), region)
        except Exception as e:
            print(f"{name:45s} error {e}")
            continue
        print(f"{name:45s}", "too small" if r is None else f"x={r[0]:4d} y={r[1]:4d} err={r[2]:.4f}")
