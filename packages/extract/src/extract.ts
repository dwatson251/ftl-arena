import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PkgArchive } from "./pkg.ts";

export interface ExtractOptions {
  /** FTL install folder (holding ftl.dat) or the ftl.dat path itself. */
  ftl: string;
  out: string;
  /** Also extract music (~200 MB). */
  music?: boolean;
}

/** Folders the arena never uses. Everything else is unpacked from the owner's own ftl.dat. */
const SKIP = [/^img\/loc-/, /^img\/ipad\//, /^img\/achievements\//, /^img\/map\//, /^fonts\//, /^data\/text-/];

export function extractFtl(opts: ExtractOptions): { files: number; bytes: number } {
  const datPath = opts.ftl.endsWith(".dat") ? opts.ftl : join(opts.ftl, "ftl.dat");
  if (!existsSync(datPath)) throw new Error(`no ftl.dat at ${datPath} (FTL 1.6+ required)`);
  const pkg = new PkgArchive(readFileSync(datPath));
  let files = 0;
  let bytes = 0;
  const manifest: string[] = [];
  for (const e of pkg.entries) {
    if (SKIP.some((r) => r.test(e.path))) continue;
    if (!opts.music && e.path.startsWith("audio/music/")) continue;
    const dest = join(opts.out, e.path);
    mkdirSync(dirname(dest), { recursive: true });
    const data = pkg.readEntry(e);
    writeFileSync(dest, data);
    manifest.push(e.path);
    files++;
    bytes += data.length;
  }
  writeFileSync(
    join(opts.out, "manifest.json"),
    JSON.stringify({ source: "ftl.dat (owner's install)", extractedAt: new Date().toISOString(), files: manifest }, null, 1),
  );
  return { files, bytes };
}
