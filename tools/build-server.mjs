/**
 * Builds the headless dedicated server as standalone executables (Node's single-executable applications: the
 * program carries its own Node, so the machine running it needs nothing installed).
 *   node tools/build-server.mjs            → release/server/FTL-Arena-Server-win-x64.zip and …-linux-x64.tar.gz
 *   node tools/build-server.mjs --linux    (or --win) only that one
 * The Windows build injects into the official node.exe of this same Node version (downloaded once, cached).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(".");
const out = join(root, "release/server");
const cache = join(root, "release/.cache");
mkdirSync(out, { recursive: true });
mkdirSync(cache, { recursive: true });
const args = process.argv.slice(2);
const want = (p) => !(args.includes("--win") || args.includes("--linux")) || args.includes(`--${p}`);
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: "inherit", cwd: root, ...opts });

console.log("· bundle");
const bundle = join(out, "ftl-arena-server.cjs");
await build({
  entryPoints: [join(root, "apps/server/src/dedicated.ts")],
  outfile: bundle, bundle: true, platform: "node", format: "cjs", target: "node22",
  external: ["bufferutil", "utf-8-validate"], logLevel: "warning",
  // No debug tools in a release (apps/server/src/lobby.ts).
  define: { __RELEASE__: "true" },
});

console.log("· SEA blob");
const blob = join(out, "sea.blob");
writeFileSync(join(out, "sea-config.json"), JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false }));
run(process.execPath, ["--experimental-sea-config", join(out, "sea-config.json")]);

const inject = (exe, macho = false) =>
  run(process.execPath, [join(root, "node_modules/postject/dist/cli.js"), exe, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2", ...(macho ? ["--macho-segment-name", "NODE_SEA"] : [])]);

const readme = `FTL ARENA - dedicated server
=============================

A headless server that hosts any number of FTL Arena matches. Nothing to install or set up: run it, then
give players the address it prints (IP:port). Players put that in "Server address" in the game and press
Create match or Join. (It doesn't need FTL: each player's own app draws the game from their own copy.)

Options:  --port 8787   --host 0.0.0.0   --upnp (open the port on your router)   --no-lan   --help
Settings can also live in ftl-arena-server.json next to this program: run it once with --write-config to
create one, then edit it. Arguments override the file.
Players on the internet: forward TCP 8787 on your router to this machine (or try --upnp).
`;

// Linux: this machine's own node (so build the Linux one on Linux).
if (want("linux")) {
console.log("· linux-x64");
const lin = join(out, "linux");
rmSync(lin, { recursive: true, force: true });
mkdirSync(lin, { recursive: true });
copyFileSync(process.execPath, join(lin, "ftl-arena-server"));
chmodSync(join(lin, "ftl-arena-server"), 0o755);
inject(join(lin, "ftl-arena-server"));
writeFileSync(join(lin, "README.txt"), readme);
run("tar", ["-czf", join(out, "FTL-Arena-Server-linux-x64.tar.gz"), "-C", lin, "."]);
}

// Windows: the official node.exe of the same version.
if (want("win")) {
console.log("· win-x64");
const ver = process.version;
// On Windows that's this node itself; elsewhere it's downloaded once.
const nodeExe = process.platform === "win32" ? process.execPath : join(cache, `node-${ver}-win-x64.exe`);
if (!existsSync(nodeExe)) run("curl", ["-fsSL", "-o", nodeExe, `https://nodejs.org/dist/${ver}/win-x64/node.exe`]);
const win = join(out, "win");
rmSync(win, { recursive: true, force: true });
mkdirSync(win, { recursive: true });
copyFileSync(nodeExe, join(win, "FTL-Arena-Server.exe"));
inject(join(win, "FTL-Arena-Server.exe"));
writeFileSync(join(win, "README.txt"), readme.replace(/\n/g, "\r\n"));
const zip = join(out, "FTL-Arena-Server-win-x64.zip");
rmSync(zip, { force: true });
run(process.platform === "win32" ? "python" : "python3", ["-m", "zipfile", "-c", zip, join(win, "FTL-Arena-Server.exe"), join(win, "README.txt")]);
}
console.log("· done:", out);
