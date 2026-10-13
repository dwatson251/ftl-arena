/**
 * FTL Arena dedicated server: a headless console program that hosts any number of matches. Grab and go: it
 * needs nothing installed and nothing set up (no FTL: it sends the game's data, and each player's own app
 * draws it). Players put its address in "Server address" and Create or Join as usual. See HELP for options.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { cleanConfig, resolveConfig, type DedicatedConfig } from "./config.ts";
import { startServer } from "./server.ts";
import { lanAddresses, publicAddress } from "./upnp.ts";

const HELP = `FTL Arena dedicated server

  ftl-arena-server [--port 8787] [--host 0.0.0.0] [--upnp] [--no-lan] [--client <built web client>]
                   [--admin-token <secret>] [--config <file>] [--write-config]

Runs as is: nothing to install or set up. Settings, each overriding the one before:
  1. built-in defaults (port 8787, every interface, LAN discovery on, UPnP off);
  2. ftl-arena-server.json next to the program (or --config <file>);
  3. environment: PORT, FTL_ARENA_HOST, FTL_ARENA_UPNP=1, FTL_ARENA_LAN=0, FTL_ARENA_ADMIN_TOKEN;
  4. the arguments above.
--write-config writes the settings in force to the config file, to edit, and exits.

Admin page and API: http://localhost:<port>/admin (status, lobbies and players, logs, settings). From other
machines it needs the admin token (?token=... or Authorization: Bearer ...); without one it's this machine only.`;

/** Folder of the packaged program (its config sits beside it), else the working folder. */
const home = (process as unknown as { isSea?: () => boolean }).isSea?.() || /ftl-arena-server(\.exe)?$/i.test(process.execPath) ? dirname(process.execPath) : process.cwd();

const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (s: string) => console.log(`${stamp()}  ${s}`);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return void console.log(HELP);
  const { cfg, from, file, fileError } = resolveConfig(args, process.env, (p) => (existsSync(p) ? readFileSync(p, "utf8") : null), home);
  if (args.includes("--write-config")) {
    writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
    return void console.log(`wrote ${file}`);
  }
  if (fileError) log(fileError);
  const live = { ...cfg };
  // (The admin's saves are logged through the server, once it's up, so they show on the admin page.)
  let say = log;
  const server = await startServer({
    port: cfg.port, host: cfg.host, upnp: cfg.upnp, lan: cfg.lan, client: cfg.client || undefined, log,
    admin: {
      token: () => live.adminToken,
      // (The token itself is never sent back; leave it blank in the form to keep it.)
      getConfig: () => ({ ...live, adminToken: "" }),
      setConfig: (raw) => {
        const c = cleanConfig(raw as never);
        if (c.error) return { ok: false, error: c.error };
        if (c.cfg.adminToken === "") delete c.cfg.adminToken;
        const next = { ...live, ...c.cfg };
        try {
          writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
        } catch (e) {
          return { ok: false, error: `couldn't write ${file}: ${(e as Error).message}` };
        }
        const restart = (["port", "host", "upnp", "lan", "client"] as const).some((k) => next[k] !== live[k]);
        live.adminToken = next.adminToken;
        say(`settings saved to ${file}${restart ? " (restart to apply)" : ""}`);
        return { ok: true, restart };
      },
    },
  });
  say = server.log;
  server.log(`settings: ${Object.entries(cfg).map(([k, v]) => `${k}=${k === "adminToken" ? (v ? '"(set)"' : '""') : JSON.stringify(v)} (${from[k as keyof DedicatedConfig]})`).join(", ")}`);
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
