import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDbFromFtl, placeholderDb, type GameDB } from "@ftl/data";

/** The game DB from an extracted asset folder, or the placeholder set when there is none. */
export function loadDb(assetsDir?: string): GameDB {
  if (!assetsDir || !existsSync(join(assetsDir, "data/blueprints.xml"))) return placeholderDb();
  return buildDbFromFtl(
    (p) => {
      const f = join(assetsDir, p);
      return existsSync(f) ? readFileSync(f, "utf8") : undefined;
    },
    (p) => {
      // A PNG's size sits in its IHDR chunk: big-endian width and height at bytes 16 and 20.
      const f = join(assetsDir, p);
      if (!existsSync(f)) return undefined;
      const b = readFileSync(f);
      return b.length > 24 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : undefined;
    },
  );
}
