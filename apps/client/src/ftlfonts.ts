/**
 * FTL's bitmap fonts as real web fonts. The extractor turns each fonts/*.font into a PNG atlas + JSON
 * metrics; here every glyph's pixels become square contours (one rectangle per horizontal run), built into
 * an OpenType font with opentype.js and registered with the FontFace API. Pixi Text and the DOM then use
 * FTL's exact lettering. At font-size = lineHeight × n, one atlas pixel is n CSS pixels.
 */
import opentype from "opentype.js";

export type FtlFont = "HL1" | "HL2" | "JustinFont8" | "JustinFont10" | "JustinFont11Bold" | "JustinFont12Bold" | "candc" | "num_font";
export const FONTS: FtlFont[] = ["HL1", "HL2", "JustinFont8", "JustinFont10", "JustinFont11Bold", "JustinFont12Bold", "candc", "num_font"];

interface Metrics {
  lineHeight: number;
  baseline: number;
  width: number;
  height: number;
  glyphs: { c: number; x: number; y: number; w: number; h: number; by: number; bx: number; adv: number }[];
}

const loaded = new Map<FtlFont, Metrics>();
const UNIT = 100;

export const family = (f: FtlFont) => `FTL-${f}`;
/** Font size for `scale` pixels per atlas pixel, or a sensible fallback size when the font isn't loaded. */
export const fontSize = (f: FtlFont, scale = 1) => (loaded.get(f)?.lineHeight ?? FALLBACK_SIZE[f]) * scale;
export const hasFont = (f: FtlFont) => loaded.has(f);
const FALLBACK_SIZE: Record<FtlFont, number> = { HL1: 11, HL2: 12, JustinFont8: 12, JustinFont10: 13, JustinFont11Bold: 13, JustinFont12Bold: 14, candc: 12, num_font: 22 };
export const cssFamily = (f: FtlFont) => `'${family(f)}', 'Consolas', 'Lucida Console', monospace`;

async function loadOne(f: FtlFont): Promise<void> {
  const r = await fetch(`/assets/fonts/${f}.json`);
  if (!r.ok) return;
  const m = (await r.json()) as Metrics;
  const img = new Image();
  img.src = `/assets/fonts/${f}.png`;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, img.width, img.height).data;
  const glyphs: opentype.Glyph[] = [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 4 * UNIT, path: new opentype.Path() })];
  const seen = new Set<number>();
  for (const g of m.glyphs) {
    if (seen.has(g.c) || g.c === 0) continue;
    seen.add(g.c);
    const path = new opentype.Path();
    for (let yy = 0; yy < g.h; yy++) {
      let run = -1;
      for (let xx = 0; xx <= g.w; xx++) {
        const on = xx < g.w && px[((g.y + yy) * img.width + g.x + xx) * 4 + 3] > 110;
        if (on && run < 0) run = xx;
        if (!on && run >= 0) {
          // Font space is y-up from the baseline; the glyph's top row sits `by` pixels above it.
          const x0 = (g.bx + run) * UNIT;
          const x1 = (g.bx + xx) * UNIT;
          const yTop = (g.by - yy) * UNIT;
          const yBot = yTop - UNIT;
          path.moveTo(x0, yTop);
          path.lineTo(x0, yBot);
          path.lineTo(x1, yBot);
          path.lineTo(x1, yTop);
          path.close();
          run = -1;
        }
      }
    }
    glyphs.push(new opentype.Glyph({ name: `u${g.c.toString(16)}`, unicode: g.c, advanceWidth: Math.max(1, g.w + g.adv) * UNIT, path }));
  }
  const font = new opentype.Font({
    familyName: family(f), styleName: "Regular", unitsPerEm: m.lineHeight * UNIT, ascender: m.baseline * UNIT,
    descender: -(m.lineHeight - m.baseline) * UNIT, glyphs,
  });
  const face = new FontFace(family(f), font.toArrayBuffer());
  await face.load();
  document.fonts.add(face);
  loaded.set(f, m);
}

/** Load every FTL font that was extracted; missing ones fall back to a monospace system font. */
export async function loadFtlFonts(): Promise<boolean> {
  await Promise.all(FONTS.map((f) => loadOne(f).catch((e) => console.warn(`font ${f}:`, e))));
  if (loaded.size) {
    const css = document.createElement("style");
    css.textContent = FONTS.filter(hasFont)
      .map((f) => `.ftl-${f} { font-family: ${cssFamily(f)}; font-size: ${fontSize(f)}px; -webkit-font-smoothing: none; }`)
      .join("\n");
    document.head.appendChild(css);
  }
  return loaded.size > 0;
}
