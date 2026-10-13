/**
 * FTL Arena dedicated server: a headless console program that hosts any number of matches. Grab and go: it
 * needs nothing installed and nothing set up (no FTL: it sends the game's data, and each player's own app
 * draws it). Players put its address in "Server address" and Create or Join as usual. See HELP for options.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { startServer } from "./server.ts";
import { lanAddresses, publicAddress } from "./upnp.ts";

const HELP = `FTL Arena dedicated server

  ftl-arena-server [--port 8787] [--host 0.0.0.0] [--upnp] [--no-lan] [--client <built web client>]
                   [--config <file>] [--write-config]

Runs as is: nothing to install or set up. Settings, each overriding the one before:
  1. built-in defaults (port 8787, every interface, LAN discovery on, UPnP off);
  2. ftl-arena-server.json next to the program (or --config <file>);
  3. environment: PORT, FTL_ARENA_HOST, FTL_ARENA_UPNP=1, FTL_ARENA_LAN=0;
  4. the arguments above.
--write-config writes the settings in force to the config file, to edit, and exits.`;

export interface DedicatedConfig {
  /** TCP port players connect to. */
  port: number;
  /** Interface to listen on ("0.0.0.0" = every one). */
  host: string;
  /** Ask the router to open the port (UPnP). */
  upnp: boolean;
  /** Answer LAN "who has this code?" questions, so players on the same network can join by code alone. */
  lan: boolean;
  /** A built web client to serve at / (optional: players normally use the app). */
  client: string;
}

export const DEFAULTS: DedicatedConfig = { port: 8787, host: "0.0.0.0", upnp: false, lan: true, client: "" };

/** Folder of the packaged program (its config sits beside it), else the working folder. */
const home = (process as unknown as { isSea?: () => boolean }).isSea?.() || /ftl-arena-server(\.exe)?$/i.test(process.execPath) ? dirname(process.execPath) : process.cwd();

/** The settings in force, and where each came from. */
export function resolveConfig(
  args: string[],
  env: Record<string, string | undefined>,
  readFile: (p: string) => string | null,
): { cfg: DedicatedConfig; from: Record<keyof DedicatedConfig, string>; file: string; fileError?: string } {
  const arg = (k: string) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const file = resolve(arg("--config") ?? join(home, "ftl-arena-server.json"));
  const cfg: DedicatedConfig = { ...DEFAULTS };
  const from = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, "default"])) as Record<keyof DedicatedConfig, string>;
  const set = <K extends keyof DedicatedConfig>(k: K, v: DedicatedConfig[K] | undefined, src: string) => {
    if (v === undefined || (typeof v === "number" && !(Number.isInteger(v) && v >= 0 && v < 65536))) return;
    cfg[k] = v;
    from[k] = src;
  };
  let fileError: string | undefined;
  const raw = readFile(file);
  if (raw !== null) {
    try {
      const j = JSON.parse(raw) as Partial<Record<keyof DedicatedConfig, unknown>>;
      if (j.port !== undefined) set("port", Number(j.port), "config");
      if (typeof j.host === "string") set("host", j.host, "config");
      if (j.upnp !== undefined) set("upnp", !!j.upnp, "config");
      if (j.lan !== undefined) set("lan", !!j.lan, "config");
      if (typeof j.client === "string") set("client", j.client, "config");
    } catch (e) {
      fileError = `couldn't read ${file}: ${(e as Error).message} (using the defaults)`;
    }
  }
  if (env.PORT) set("port", Number(env.PORT), "env");
  if (env.FTL_ARENA_HOST) set("host", env.FTL_ARENA_HOST, "env");
  if (env.FTL_ARENA_UPNP) set("upnp", env.FTL_ARENA_UPNP === "1", "env");
  if (env.FTL_ARENA_LAN) set("lan", env.FTL_ARENA_LAN !== "0", "env");
  if (arg("--port")) set("port", Number(arg("--port")), "argument");
  if (arg("--host")) set("host", arg("--host")!, "argument");
  if (args.includes("--upnp")) set("upnp", true, "argument");
  if (args.includes("--no-lan")) set("lan", false, "argument");
  if (arg("--client")) set("client", arg("--client")!, "argument");
  return { cfg, from, file, fileError };
}

const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (s: string) => console.log(`${stamp()}  ${s}`);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) return void console.log(HELP);
  const { cfg, from, file, fileError } = resolveConfig(args, process.env, (p) => (existsSync(p) ? readFileSync(p, "utf8") : null));
  if (args.includes("--write-config")) {
    writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
    return void console.log(`wrote ${file}`);
  }
  if (fileError) log(fileError);
  const server = await startServer({ port: cfg.port, host: cfg.host, upnp: cfg.upnp, lan: cfg.lan, client: cfg.client || undefined, log });
  log(`settings: ${Object.entries(cfg).map(([k, v]) => `${k}=${JSON.stringify(v)} (${from[k as keyof DedicatedConfig]})`).join(", ")}`);
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

// (Not when a test imports resolveConfig.)
if (!process.env.VITEST) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
