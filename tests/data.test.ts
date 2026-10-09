import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseLayout, parseXml, placeholderDb, walk } from "@ftl/data";
import { PkgArchive } from "@ftl/extract";
import { parseFtlFont } from "../packages/extract/src/font.ts";

describe("xml", () => {
  it("drops comments, tolerates fragments, spacing and stray closes", () => {
    const x = parseXml(`<?xml version="1.0"?><!-- <a name="dup"/> --><a name ="x"><b>1</b></c></a><a name='y'/>`);
    const as = walk(x, "a");
    expect(as.map((a) => a.attrs.name)).toEqual(["x", "y"]);
    expect(walk(x, "b")[0].text).toBe("1");
  });
});

describe("layout", () => {
  it("reads rooms and doors from the .txt grammar", () => {
    const L = parseLayout("t", "X_OFFSET\n1\nY_OFFSET\n2\nROOM\n0\n0\n0\n2\n2\nROOM\n1\n2\n0\n1\n1\nDOOR\n2\n0\n0\n1\n1\n", undefined);
    expect(L.xOffset).toBe(1);
    expect(L.rooms).toHaveLength(2);
    expect(L.doors[0]).toEqual({ x: 2, y: 0, a: 0, b: 1, vertical: true });
  });
  it("placeholder set is self-consistent", () => {
    const db = placeholderDb();
    for (const s of Object.values(db.ships)) {
      expect(db.layouts[s.layout]).toBeDefined();
      for (const w of s.weapons) expect(db.weapons[w]).toBeDefined();
    }
  });
});

const DAT = process.env.FTL_DAT ?? "/mnt/e/SteamLibrary/steamapps/common/FTL Faster Than Light/ftl.dat";
describe.skipIf(!existsSync(DAT))("ftl.dat (owner's install)", () => {
  it("every entry hash matches its path and the name region round-trips", () => {
    const buf = readFileSync(DAT);
    const pkg = new PkgArchive(buf);
    expect(pkg.entries.length).toBeGreaterThan(1000);
    for (const e of pkg.entries) expect(PkgArchive.hashPath(e.path)).toBe(e.hash);
    // Rebuild the name region from the parsed entries and compare with the original bytes.
    const count = buf.readUInt32BE(8);
    const namesAt = 16 + count * 20;
    const size = buf.readUInt32BE(12);
    const rebuilt = Buffer.alloc(size);
    for (let i = 0; i < count; i++) {
      const off = buf.readUInt32BE(16 + i * 20 + 4) & 0xffffff;
      const e = pkg.entries[i];
      rebuilt.write(e.path + "\0", off, "ascii");
    }
    expect(rebuilt.equals(buf.subarray(namesAt, namesAt + size))).toBe(true);
    expect(pkg.read("data/blueprints.xml").toString("utf8")).toContain("shipBlueprint");
  });
});

describe.skipIf(!existsSync(DAT))("FTL bitmap fonts", () => {
  it("decodes every .font: glyphs inside the atlas, ASCII present", () => {
    const pkg = new PkgArchive(readFileSync(DAT));
    const fonts = pkg.entries.filter((e) => /^fonts\/[^/]+\.font$/.test(e.path));
    expect(fonts.length).toBeGreaterThan(5);
    for (const e of fonts) {
      const f = parseFtlFont(pkg.readEntry(e));
      const codes = new Set(f.metrics.glyphs.map((g) => g.c));
      for (const ch of "AZaz09%") expect(codes.has(ch.charCodeAt(0))).toBe(true);
      for (const g of f.metrics.glyphs) {
        expect(g.x + g.w).toBeLessThanOrEqual(f.metrics.width);
        expect(g.y + g.h).toBeLessThanOrEqual(f.metrics.height);
      }
      expect(f.coverage.length).toBe(f.metrics.width * f.metrics.height);
    }
  });
});
