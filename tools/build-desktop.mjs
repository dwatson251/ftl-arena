/**
 * Builds the desktop app.
 *   node tools/build-desktop.mjs            client build + server bundle (apps/desktop/dist/server.cjs)
 *   node tools/build-desktop.mjs --run      ... then start it with Electron (development)
 *   node tools/build-desktop.mjs --win      ... then package a portable Windows app: release/FTL-Arena-win-x64.zip
 *   node tools/build-desktop.mjs --mac      ... then package a macOS app (make the .dmg on a Mac: see README)
 * The package holds only our code and the built client: never any FTL file (each player unpacks their own).
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = resolve(".");
const desktop = join(root, "apps/desktop");
const args = process.argv.slice(2);
const run = (cmd, a) => execFileSync(cmd, a, { stdio: "inherit", cwd: root });

console.log("· client build");
run("npx", ["vite", "build", "apps/client"]);

console.log("· server bundle");
await build({
  entryPoints: [join(desktop, "src/bundle.ts")],
  outfile: join(desktop, "dist/server.cjs"),
  bundle: true, platform: "node", format: "cjs", target: "node20",
  // ws's optional native speed-ups; it runs without them.
  external: ["bufferutil", "utf-8-validate", "electron"],
  logLevel: "warning",
});

if (args.includes("--run")) {
  const electron = require("electron");
  spawn(electron, [desktop], { stdio: "inherit", env: process.env }).on("exit", (c) => process.exit(c ?? 0));
} else if (args.includes("--win") || args.includes("--mac")) {
  const platform = args.includes("--win") ? "win32" : "darwin";
  const { packager } = await import("@electron/packager");
  const stage = join(root, "release/stage");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  // The client goes beside the app as resources/client (main.cjs looks there when packaged).
  cpSync(join(root, "apps/client/dist"), join(stage, "client"), { recursive: true });
  const [out] = await packager({
    dir: desktop, name: "FTL Arena", executableName: "FTL Arena", platform, arch: "x64", out: join(root, "release"), overwrite: true,
    asar: true, prune: false, extraResource: [join(stage, "client")],
    ignore: [/^\/src($|\/)/, /^\/node_modules($|\/)/, /^\/README\.txt$/],
    appCopyright: "Fan project. FTL: Faster Than Light is (c) Subset Games; you need your own copy.",
    win32metadata: { ProductName: "FTL Arena", FileDescription: "FTL Arena" },
  });
  console.log("· packaged", out);
  cpSync(join(desktop, "README.txt"), join(out, "README.txt"));
  if (platform === "win32") {
    const zip = join(root, "release/FTL-Arena-win-x64.zip");
    rmSync(zip, { force: true });
    run("python3", ["-m", "zipfile", "-c", zip, out]);
    console.log("· zipped", zip, existsSync(zip) ? "" : "(failed)");
  }
}
