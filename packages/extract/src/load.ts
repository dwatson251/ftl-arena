import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDbFromFtl, buildPresentation, placeholderDb, type GameDB } from "@ftl/data";
import { buildDb } from "@ftl/content";

const reader = (assetsDir: string) => (p: string) => {
  const f = join(assetsDir, p);
  return existsSync(f) ? readFileSync(f, "utf8") : undefined;
};

/**
 * The game DB: the arena's own content (packages/content), with the player's extracted install adding its
 * art metadata, sounds, music, crew names and FTL's own words. With no install it's the same ships and rules,
 * drawn without FTL's art.
 */
export function loadDb(assetsDir?: string): GameDB {
  return buildDb(assetsDir ? buildPresentation(reader(assetsDir)) : null);
}

/** The DB parsed straight from an install's own data files (the content generator and its equivalence test). */
export function loadFtlDb(assetsDir?: string): GameDB {
  if (!assetsDir || !existsSync(join(assetsDir, "data/blueprints.xml"))) return placeholderDb();
  return buildDbFromFtl(reader(assetsDir), (p) => {
    // A PNG's size sits in its IHDR chunk: big-endian width and height at bytes 16 and 20.
    const f = join(assetsDir, p);
    if (!existsSync(f)) return undefined;
    const b = readFileSync(f);
    return b.length > 24 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : undefined;
  });
}
