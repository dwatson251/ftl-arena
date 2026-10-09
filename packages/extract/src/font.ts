/**
 * FTL 1.6 bitmap fonts (fonts/*.font), big-endian. Layout worked out from the files themselves:
 *   "FONT", u8 version, u8 lineHeight, u8 baseline, u8 pad,
 *   u32 glyphTableOffset (24), u16 glyphCount, u16 recordSize (16), u32 imageOffset, u32 imageLength
 *   glyph: u32 codepoint, u16 x, u16 y, u8 w, u8 h, i8 bearingY, i8 bearingX, i8 advanceExtra, u8 ?, u8 spacing, u8 ?
 *   image: "TEX\n", u16 ?, u16 ?, u32 width?, ... (32-byte header) then width*height 8-bit coverage.
 * We emit an RGBA PNG (white, alpha = coverage) and a JSON metrics file the client turns into a BitmapFont.
 */
import { deflateSync } from "node:zlib";

export interface FontGlyph {
  c: number;
  x: number;
  y: number;
  w: number;
  h: number;
  by: number;
  bx: number;
  adv: number;
}

export interface FontMetrics {
  lineHeight: number;
  baseline: number;
  width: number;
  height: number;
  glyphs: FontGlyph[];
}

export function parseFtlFont(b: Buffer): { metrics: FontMetrics; coverage: Buffer } {
  if (b.toString("latin1", 0, 4) !== "FONT") throw new Error("not an FTL font");
  const lineHeight = b[5];
  const baseline = b[6];
  const table = b.readUInt32BE(8);
  const count = b.readUInt16BE(12);
  const rec = b.readUInt16BE(14);
  const imgAt = b.readUInt32BE(16);
  const imgLen = b.readUInt32BE(20);
  if (b.toString("latin1", imgAt, imgAt + 4) !== "TEX\n") throw new Error("font texture header not found");
  const pixels = imgLen - 32;
  // Width: the widest glyph extent rounded up to a power of two; height from the pixel count.
  const glyphs: FontGlyph[] = [];
  let maxX = 0;
  for (let i = 0; i < count; i++) {
    const o = table + i * rec;
    const g = {
      c: b.readUInt32BE(o), x: b.readUInt16BE(o + 4), y: b.readUInt16BE(o + 6), w: b[o + 8], h: b[o + 9],
      by: b.readInt8(o + 10), bx: b.readInt8(o + 11), adv: b.readInt8(o + 12) + b[o + 14],
    };
    maxX = Math.max(maxX, g.x + g.w);
    glyphs.push(g);
  }
  let width = 1;
  while (width < maxX) width *= 2;
  const height = Math.floor(pixels / width);
  return { metrics: { lineHeight, baseline, width, height, glyphs }, coverage: b.subarray(imgAt + 32, imgAt + 32 + width * height) };
}

/** Minimal RGBA PNG encoder (no dependencies). */
export function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export function fontToPng(f: { metrics: FontMetrics; coverage: Buffer }): Buffer {
  const { width, height } = f.metrics;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = f.coverage[i] ?? 0;
  }
  return encodePng(width, height, rgba);
}
