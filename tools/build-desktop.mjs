/**
 * Builds the desktop app.
 *   node tools/build-desktop.mjs            client build + server bundle (apps/desktop/dist/server.cjs)
 *   node tools/build-desktop.mjs --run      ... then start it with Electron (development)
 *   node tools/build-desktop.mjs --win      ... then package a portable Windows app: release/FTL-Arena-win-x64.zip
 *   node tools/build-desktop.mjs --linux    ... then package for Linux: release/FTL-Arena-linux-x64.tar.gz, and
 *                                           release/FTL-Arena-x86_64.AppImage when appimagetool is on PATH (or APPIMAGETOOL=...)
 *   node tools/build-desktop.mjs --mac      ... then package a macOS app (make the .dmg on a Mac: see docs/DEVELOPMENT.md)
 * The package holds only our code and the built client: never any FTL file (each player unpacks their own).
 */
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = resolve(".");
const desktop = join(root, "apps/desktop");
const args = process.argv.slice(2);
const run = (cmd, a) => execFileSync(cmd, a, { stdio: "inherit", cwd: root });

console.log("· client build");
run(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build", "apps/client"]);

console.log("· server bundle");
await build({
  entryPoints: [join(desktop, "src/bundle.ts")],
  outfile: join(desktop, "dist/server.cjs"),
  bundle: true, platform: "node", format: "cjs", target: "node20",
  // ws's optional native speed-ups; it runs without them.
  external: ["bufferutil", "utf-8-validate", "electron"],
  logLevel: "warning",
  // No debug tools in a release (apps/server/src/lobby.ts).
  define: { __RELEASE__: "true" },
});

if (args.includes("--run")) {
  const electron = require("electron");
  spawn(electron, [desktop], { stdio: "inherit", env: process.env }).on("exit", (c) => process.exit(c ?? 0));
} else if (args.includes("--win") || args.includes("--mac") || args.includes("--linux")) {
  const platform = args.includes("--win") ? "win32" : args.includes("--linux") ? "linux" : "darwin";
  const { packager } = await import("@electron/packager");
  const stage = join(root, "release/stage");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  // The client goes beside the app as resources/client (main.cjs looks there when packaged).
  cpSync(join(root, "apps/client/dist"), join(stage, "client"), { recursive: true });
  const [out] = await packager({
    dir: desktop, name: "FTL Arena", executableName: platform === "linux" ? "ftl-arena" : "FTL Arena", platform, arch: "x64", out: join(root, "release"), overwrite: true,
    asar: true, prune: false, extraResource: [join(stage, "client")],
    // Our own icon (tools/make-icon.py); the mac build would want an .icns made on a Mac.
    icon: platform === "win32" ? join(desktop, "icon.ico") : undefined,
    ignore: [/^\/src($|\/)/, /^\/node_modules($|\/)/, /^\/README\.txt$/],
    appCopyright: "Fan project. FTL: Faster Than Light is (c) Subset Games; you need your own copy.",
    win32metadata: { ProductName: "FTL Arena", FileDescription: "FTL Arena" },
  });
  console.log("· packaged", out);
  cpSync(join(desktop, "README.txt"), join(out, "README.txt"));
  if (platform === "win32") {
    const zip = join(root, "release/FTL-Arena-win-x64.zip");
    rmSync(zip, { force: true });
    run(process.platform === "win32" ? "python" : "python3", ["-m", "zipfile", "-c", zip, out]);
    console.log("· zipped", zip, existsSync(zip) ? "" : "(failed)");
  }
  if (platform === "linux") {
    const tgz = join(root, "release/FTL-Arena-linux-x64.tar.gz");
    rmSync(tgz, { force: true });
    run("tar", ["-czf", tgz, "-C", join(out, ".."), basename(out)]);
    console.log("· tarred", tgz);
    appImage(out);
  }
}

/** A single-file AppImage (runs on a Steam Deck and most distros as is). Needs appimagetool. */
function appImage(out) {
  const tool = process.env.APPIMAGETOOL ?? "appimagetool";
  try {
    execFileSync(tool, ["--version"], { stdio: "ignore", env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: "1" } });
  } catch {
    console.log("· no appimagetool: skipping the AppImage");
    return;
  }
  const dir = join(root, "release/FTL-Arena.AppDir");
  rmSync(dir, { recursive: true, force: true });
  cpSync(out, join(dir, "usr/lib/ftl-arena"), { recursive: true, verbatimSymlinks: true });
  // Chromium's setuid sandbox can't work from a read-only AppImage mount, so it runs without it.
  writeFileSync(join(dir, "AppRun"), '#!/bin/sh\nHERE="$(dirname "$(readlink -f "$0")")"\nexec "$HERE/usr/lib/ftl-arena/ftl-arena" --no-sandbox "$@"\n');
  chmodSync(join(dir, "AppRun"), 0o755);
  writeFileSync(join(dir, "ftl-arena.desktop"), "[Desktop Entry]\nType=Application\nName=FTL Arena\nComment=1v1 real-time FTL battles (needs your own copy of FTL)\nExec=ftl-arena\nIcon=ftl-arena\nCategories=Game;StrategyGame;\nTerminal=false\n");
  cpSync(join(desktop, "icon.png"), join(dir, "ftl-arena.png"));
  const img = join(root, "release/FTL-Arena-x86_64.AppImage");
  rmSync(img, { force: true });
  execFileSync(tool, [dir, img], { stdio: "inherit", cwd: root, env: { ...process.env, ARCH: "x86_64", APPIMAGE_EXTRACT_AND_RUN: "1" } });
  console.log("· AppImage", img);
}
