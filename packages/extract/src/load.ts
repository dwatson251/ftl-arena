import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDbFromFtl, placeholderDb, type GameDB } from "@ftl/data";

/** The game DB from an extracted asset folder, or the placeholder set when there is none. */
export function loadDb(assetsDir: string): GameDB {
  if (!existsSync(join(assetsDir, "data/blueprints.xml"))) return placeholderDb();
  return buildDbFromFtl((p) => {
    const f = join(assetsDir, p);
    return existsSync(f) ? readFileSync(f, "utf8") : undefined;
  });
}
