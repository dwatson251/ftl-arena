/**
 * FTL Arena dedicated server: a headless console program that hosts any number of matches. Players put its
 * address in "Server address" and Create or Join as usual.
 *   ftl-arena-server [--port 8787] [--ftl "<FTL folder>"] [--data <folder>] [--upnp]
 * First run: it needs your own FTL install to read the game's rules from (it asks for the folder, or finds
 * Steam's), and unpacks it into its data folder next to the program.
 */
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { extractFtlAsync } from "@ftl/extract";
import { startServer } from "./server.ts";
import { lanAddresses, publicAddress } from "./upnp.ts";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (s: string) => console.log(`${stamp()}  ${s}`);

/** Next to the program when it's the packaged executable, else the working folder. */
const home = (process as unknown as { isSea?: () => boolean }).isSea?.() || /ftl-arena-server(\.exe)?$/i.test(process.execPath) ? dirname(process.execPath) : process.cwd();
const data = resolve(arg("--data") ?? join(home, "ftl-arena-data"));
const assets = join(data, "assets");

function datIn(folder: string): string | null {
  const f = folder.replace(/^["']|["']$/g, "").trim();
  for (const p of [f, join(f, "FTL.app", "Contents", "Resources"), join(f, "Contents", "Resources")]) if (existsSync(join(p, "ftl.dat"))) return join(p, "ftl.dat");
  return f.endsWith("ftl.dat") && existsSync(f) ? f : null;
}

function steamGuesses(): string[] {
  const roots = ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam", join(homedir(), ".steam/steam"), join(homedir(), ".local/share/Steam"), join(homedir(), "Library/Application Support/Steam")];
  const libs = new Set(roots);
  for (const r of roots) {
    try {
      for (const m of readFileSync(join(r, "steamapps", "libraryfolders.vdf"), "utf8").matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, "\\"));
    } catch {}
  }
  return [...libs].map((l) => join(l, "steamapps", "common", "FTL Faster Than Light")).filter((p) => datIn(p));
}

async function setup(): Promise<void> {
  if (existsSync(join(assets, "manifest.json"))) return;
  console.log("First run: FTL Arena reads the game's rules from your own copy of FTL (1.6 or later).");
  let dat = arg("--ftl") ? datIn(arg("--ftl")!) : null;
  if (!dat) {
    const found = steamGuesses()[0];
    if (found) {
      console.log(`Found FTL at ${found}`);
      dat = datIn(found);
    }
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  while (!dat) {
    const a = await rl.question("Drag your FTL folder (the one with ftl.dat) onto this window, or type its path, then press Enter:\n> ");
    dat = datIn(a);
    if (!dat) console.log("No ftl.dat there. Try again.");
  }
  rl.close();
  const part = `${assets}.part`;
  rmSync(part, { recursive: true, force: true });
  let shown = -1;
  const r = await extractFtlAsync({ ftl: dat, out: part, music: false }, (done, total) => {
    const pct = Math.floor((100 * done) / total);
    if (pct !== shown) process.stdout.write(`\rUnpacking ${pct}%`);
    shown = pct;
  });
  rmSync(assets, { recursive: true, force: true });
  renameSync(part, assets);
  console.log(`\rUnpacked ${r.files} files into ${assets}`);
}

async function main(): Promise<void> {
  await setup();
  const port = Number(arg("--port") ?? process.env.PORT ?? 8787);
  const server = await startServer({ port, assets, upnp: args.includes("--upnp"), log });
  const pub = await publicAddress();
  console.log("");
  console.log("  FTL Arena dedicated server is running. Players put one of these in \"Server address\":");
  if (pub) console.log(`    ${pub}:${server.port}    (internet: forward TCP ${server.port} on your router to this machine, or use --upnp)`);
  for (const a of lanAddresses()) console.log(`    ${a}:${server.port}    (same network)`);
  console.log("  Press Ctrl+C to stop.\n");
  const stop = () => {
    log("stopping");
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
