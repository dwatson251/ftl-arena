/**
 * Builds the desktop server app (apps/server-app): the dedicated server with a window for its settings,
 * start and stop, players and logs. It needs no FTL.
 *   node tools/build-server-app.mjs            server bundle (apps/server-app/dist/server.cjs)
 *   node tools/build-server-app.mjs --run      ... then start it with Electron (development)
 *   node tools/build-server-app.mjs --win      ... then package it: release/FTL-Arena-Server-App-win-x64.zip
 *   node tools/build-server-app.mjs --linux    ... then package it: release/FTL-Arena-Server-App-linux-x64.tar.gz
 */
import { execFileSync, spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, resolve } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
/** The build's version: FTL_ARENA_VERSION (CI: the tag), else this commit's tag, else its short hash. */
function appVersion() {
  const git = (a) => {
    try {
      return execFileSync("git", a, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      return "";
    }
  };
  return (process.env.FTL_ARENA_VERSION || git(["describe", "--tags", "--exact-match"]) || git(["rev-parse", "HEAD"]).slice(-7) || "dev").replace(/^v/, "");
}
const root = resolve(".");
const appDir = join(root, "apps/server-app");
const args = process.argv.slice(2);
const run = (cmd, a) => execFileSync(cmd, a, { stdio: "inherit", cwd: root });

console.log("· server bundle");
await build({
  entryPoints: [join(appDir, "src/bundle.ts")],
  outfile: join(appDir, "dist/server.cjs"),
  bundle: true, platform: "node", format: "cjs", target: "node20",
  external: ["bufferutil", "utf-8-validate", "electron"],
  logLevel: "warning",
  // No debug tools in a release (apps/server/src/lobby.ts).
  define: { __RELEASE__: "true", __APP_VERSION__: JSON.stringify(appVersion()) },
});

if (args.includes("--run")) {
  const electron = require("electron");
  spawn(electron, [appDir, ...args.filter((a) => a !== "--run")], { stdio: "inherit", env: process.env }).on("exit", (c) => process.exit(c ?? 0));
} else if (args.includes("--win") || args.includes("--linux")) {
  const platform = args.includes("--win") ? "win32" : "linux";
  const { packager } = await import("@electron/packager");
  const [out] = await packager({
    dir: appDir, name: "FTL Arena Server", executableName: platform === "linux" ? "ftl-arena-server-app" : "FTL Arena Server", platform, arch: "x64",
    out: join(root, "release"), overwrite: true, asar: true, prune: false,
    icon: platform === "win32" ? join(appDir, "icon.ico") : undefined,
    ignore: [/^\/src($|\/)/, /^\/node_modules($|\/)/],
    appCopyright: "Fan project. FTL: Faster Than Light is (c) Subset Games.",
    win32metadata: { ProductName: "FTL Arena Server", FileDescription: "FTL Arena Server" },
  });
  writeFileSync(join(out, "README.txt"), `FTL ARENA SERVER
================

Run "FTL Arena Server" (Linux: ftl-arena-server-app), set the port if you like, and press Start server.
Players put this computer's address (shown at the top) in "Server address" in the game. The server needs
no FTL: each player's own app draws the game. Players on the internet need the port forwarded on your
router to this computer (or tick UPnP).

While it runs, the window shows the server's admin page: players, lobbies and the log. The same page is at
http://<this computer>:<port>/admin from other machines once you set an admin token (add ?token=...).
Start it with --start to start the server straight away. For a server with no window at all, use the
FTL-Arena-Server download instead.
`.replace(/\n/g, platform === "win32" ? "\r\n" : "\n"));
  console.log("· packaged", out);
  if (platform === "win32") {
    const zip = join(root, "release/FTL-Arena-Server-App-win-x64.zip");
    rmSync(zip, { force: true });
    run(process.platform === "win32" ? "python" : "python3", ["-m", "zipfile", "-c", zip, out]);
    console.log("· zipped", zip);
  } else {
    const tgz = join(root, "release/FTL-Arena-Server-App-linux-x64.tar.gz");
    rmSync(tgz, { force: true });
    run("tar", ["-czf", tgz, "-C", join(out, ".."), basename(out)]);
    console.log("· tarred", tgz);
  }
}

