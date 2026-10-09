/**
 * ftl-arena extract --ftl "<FTL install>" [--out assets-local] [--music]
 * Unpacks your own FTL 1.6+ ftl.dat into a private, gitignored asset folder the arena loads.
 */
import { resolve } from "node:path";
import { extractFtl } from "./extract.ts";

const args = process.argv.slice(2);
const get = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const ftl = get("--ftl") ?? process.env.FTL_DIR;
if (!ftl) {
  console.error('usage: npm run extract -- --ftl "<FTL install folder>" [--out assets-local] [--music]');
  process.exit(2);
}
const out = resolve(get("--out") ?? "assets-local");
const r = extractFtl({ ftl, out, music: args.includes("--music") });
console.log(`extracted ${r.files} files (${(r.bytes / 1e6).toFixed(1)} MB) -> ${out}`);
