"""
Draws the FTL Arena app icon from scratch (no game art): FTL-style block letters, two crossed weapon beams for
the duel, and an orange ARENA banner in a chunky pixel font, on a nebula. Small sizes get a simplified version.
  uv run --with pillow python tools/make-icon.py   ->  apps/desktop/icon.ico (16-256) and apps/desktop/icon.png (512)
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "apps" / "desktop"
S = 1024  # drawing size; every size is downsampled from this

# FTL-style block letters on a 100 x 60 grid (x, y, w, h).
FTL = [
    (0, 0, 10, 60), (0, 0, 28, 11), (0, 25, 22, 10),  # F
    (32, 0, 32, 11), (42.5, 0, 11, 60),  # T
    (68, 0, 11, 60), (68, 49, 30, 11),  # L
]
# A 5 x 7 pixel font for ARENA.
FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "N": ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
}
ORANGE = (232, 106, 44)
ORANGE_DARK = (120, 42, 18)
WHITE = (244, 247, 252)


def background(img: Image.Image, r: int) -> None:
    rnd = random.Random(7)
    base = Image.new("RGBA", (S, S))
    px = base.load()
    for y in range(S):
        for x in range(S):
            # Deep space, a violet nebula top-left and a teal glow bottom-right.
            d1 = math.hypot(x - S * 0.28, y - S * 0.3) / S
            d2 = math.hypot(x - S * 0.8, y - S * 0.85) / S
            v = max(0.0, 1 - d1 * 1.9)
            t = max(0.0, 1 - d2 * 2.4)
            px[x, y] = (int(10 + 70 * v * v + 10 * t), int(12 + 18 * v + 60 * t * t), int(26 + 90 * v * v + 70 * t * t), 255)
    d = ImageDraw.Draw(base)
    for _ in range(140):
        x, y, s = rnd.random() * S, rnd.random() * S, rnd.choice([2, 2, 3, 4, 6])
        a = rnd.randint(120, 255)
        d.ellipse([x, y, x + s, y + s], fill=(255, 255, 255, a))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    img.paste(base, (0, 0), mask)


def beams(img: Image.Image) -> None:
    """Two weapon beams crossing behind the letters: red (laser) from one corner, green from the other."""
    glow = Image.new("RGBA", (S, S))
    d = ImageDraw.Draw(glow)
    for (a, b, col) in [((-40, 820), (1064, 120), (255, 70, 60)), ((-40, 120), (1064, 820), (90, 255, 140))]:
        d.line([a, b], fill=col + (150,), width=70)
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    for (a, b, col) in [((-40, 820), (1064, 120), (255, 150, 140)), ((-40, 120), (1064, 820), (190, 255, 210))]:
        d.line([a, b], fill=col + (255,), width=14)
    # The flash where they meet.
    fl = Image.new("RGBA", (S, S))
    ImageDraw.Draw(fl).ellipse([S / 2 - 120, 470 - 120, S / 2 + 120, 470 + 120], fill=(255, 240, 220, 200))
    img.alpha_composite(fl.filter(ImageFilter.GaussianBlur(40)))


def letters(img: Image.Image, x0: float, y0: float, scale: float, shadow: bool = True) -> None:
    if shadow:
        sh = Image.new("RGBA", (S, S))
        d = ImageDraw.Draw(sh)
        for (x, y, w, h) in FTL:
            d.rectangle([x0 + x * scale + 16, y0 + y * scale + 22, x0 + (x + w) * scale + 16, y0 + (y + h) * scale + 22], fill=(0, 0, 0, 200))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
    d = ImageDraw.Draw(img)
    for (x, y, w, h) in FTL:
        box = [x0 + x * scale, y0 + y * scale, x0 + (x + w) * scale, y0 + (y + h) * scale]
        d.rectangle(box, fill=WHITE + (255,))
        # A cool steel shade on the lower part of each block, like hull plating.
        d.rectangle([box[0], box[1] + (box[3] - box[1]) * 0.78, box[2], box[3]], fill=(206, 214, 228, 255))


def banner(img: Image.Image, y: float, h: float, word: str = "ARENA") -> None:
    d = ImageDraw.Draw(img)
    # Angled FTL-UI style plate.
    x0, x1 = 120, S - 120
    cut = h * 0.45
    plate = [(x0 + cut, y), (x1, y), (x1 - cut, y + h), (x0, y + h)]
    d.polygon([(px + 10, py + 14) for px, py in plate], fill=(0, 0, 0, 160))
    d.polygon(plate, fill=ORANGE + (255,))
    d.line(plate + [plate[0]], fill=(255, 196, 140, 255), width=8)
    # Pixel letters, centred.
    cell = h / 10.5
    gap = cell
    width = len(word) * 5 * cell + (len(word) - 1) * gap
    lx = (S - width) / 2
    ly = y + (h - 7 * cell) / 2
    for i, ch in enumerate(word):
        for r, row in enumerate(FONT[ch]):
            for c, on in enumerate(row):
                if on != "#":
                    continue
                bx = lx + i * (5 * cell + gap) + c * cell
                by = ly + r * cell
                d.rectangle([bx + cell * 0.18, by + cell * 0.22, bx + cell * 1.18, by + cell * 1.22], fill=ORANGE_DARK + (255,))
                d.rectangle([bx, by, bx + cell, by + cell], fill=WHITE + (255,))


def full() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    background(img, 180)
    beams(img)
    letters(img, 120, 150, 7.85)
    banner(img, 690, 190)
    return img


def small() -> Image.Image:
    """16-32 px: the letters fill the square over a thick orange underline; no words to squint at."""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    background(img, 150)
    letters(img, 70, 170, 8.85, shadow=False)
    d = ImageDraw.Draw(img)
    d.rectangle([70, 780, S - 70, 900], fill=ORANGE + (255,))
    return img


def main() -> None:
    big, little = full(), small()
    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [(little if s <= 32 else big).resize((s, s), Image.LANCZOS) for s in sizes]
    big.resize((512, 512), Image.LANCZOS).save(OUT / "icon.png")
    frames[-1].save(OUT / "icon.ico", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
    print("wrote", OUT / "icon.ico", "and", OUT / "icon.png")


if __name__ == "__main__":
    main()
