import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PkgArchive } from "./pkg.ts";
import { fontToPng, parseFtlFont } from "./font.ts";

export interface ExtractOptions {
  /** FTL install folder (holding ftl.dat) or the ftl.dat path itself. */
  ftl: string;
  out: string;
  /** Extract music too (default on; the arena plays FTL's menu and battle tracks). */
  music?: boolean;
  /** Every data file too (blueprints, layouts): only for regenerating packages/content (tools/content). */
  allData?: boolean;
}

/** Folders the arena never uses. */
const SKIP = [/^img\/loc-/, /^img\/ipad\//, /^img\/achievements\//, /^img\/map\//, /^fonts\/(ja|zh)/, /^data\/text-/];
/**
 * The game's rules, ships and layouts are the arena's own (packages/content). From data/ only what presents
 * them is unpacked: FTL's text, its animation sheets, sound names and the crew name pool.
 */
const PRESENTATION = /^data\/(text_blueprints|text_misc|animations|dlcAnimations|sounds|dlcSounds|names)\.xml$/;
const wanted = (path: string, o: ExtractOptions) =>
  !SKIP.some((r) => r.test(path)) && !(o.music === false && path.startsWith("audio/music/")) && (!path.startsWith("data/") || o.allData || PRESENTATION.test(path));

/**
 * The extraction as steps: each yield is one entry done (of `total`). The manifest is written last, so a folder
 * with a manifest.json is a finished extract (the desktop app's setup checks for it).
 */
function* extractSteps(opts: ExtractOptions): Generator<{ done: number; total: number }, { files: number; bytes: number }> {
  const datPath = opts.ftl.endsWith(".dat") ? opts.ftl : [join(opts.ftl, "ftl.dat"), join(opts.ftl, "data", "ftl.dat")].find((f) => existsSync(f)) ?? join(opts.ftl, "ftl.dat");
  if (!existsSync(datPath)) throw new Error(`no ftl.dat at ${datPath} (FTL 1.6+ required)`);
  const pkg = new PkgArchive(readFileSync(datPath));
  let files = 0;
  let bytes = 0;
  const manifest: string[] = [];
  const todo = pkg.entries.filter((e) => wanted(e.path, opts));
  for (const [i, e] of todo.entries()) {
    const dest = join(opts.out, e.path);
    mkdirSync(dirname(dest), { recursive: true });
    const data = pkg.readEntry(e);
    if (e.path.endsWith(".font")) {
      // Bitmap fonts become a PNG atlas + JSON metrics the browser can use.
      const f = parseFtlFont(data);
      const base = dest.replace(/\.font$/, "").replace(/&/g, "and");
      writeFileSync(`${base}.png`, fontToPng(f));
      writeFileSync(`${base}.json`, JSON.stringify(f.metrics));
    } else {
      writeFileSync(dest, data);
      bytes += data.length;
    }
    manifest.push(e.path);
    files++;
    yield { done: i + 1, total: todo.length };
  }
  writeFileSync(
    join(opts.out, "manifest.json"),
    JSON.stringify({ source: "ftl.dat (owner's install)", extractedAt: new Date().toISOString(), files: manifest }, null, 1),
  );
  return { files, bytes };
}

export function extractFtl(opts: ExtractOptions): { files: number; bytes: number } {
  const it = extractSteps(opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** The same, giving the event loop a turn every few files and reporting progress (for a setup screen). */
export async function extractFtlAsync(opts: ExtractOptions, onProgress: (done: number, total: number) => void = () => {}): Promise<{ files: number; bytes: number }> {
  const it = extractSteps(opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    onProgress(r.value.done, r.value.total);
    if (r.value.done % 20 === 0) await new Promise((ok) => setImmediate(ok));
  }
}
