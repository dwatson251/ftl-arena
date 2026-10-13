/** The dedicated server's settings (the headless program and the desktop server app share them). */
import { join, resolve } from "node:path";

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
  /** The admin page and API from other machines need this (http://<server>/admin?token=...). Empty: this
   *  machine only. */
  adminToken: string;
}

export const DEFAULTS: DedicatedConfig = { port: 8787, host: "0.0.0.0", upnp: false, lan: true, client: "", adminToken: "" };

/** Settings as given (a config file, the admin page): known keys only, each checked; null where it's wrong. */
export function cleanConfig(j: Partial<Record<keyof DedicatedConfig, unknown>>): { cfg: Partial<DedicatedConfig>; error?: string } {
  const cfg: Partial<DedicatedConfig> = {};
  if (j.port !== undefined) {
    const p = Number(j.port);
    if (!Number.isInteger(p) || p < 0 || p > 65535) return { cfg, error: "port must be 0-65535" };
    cfg.port = p;
  }
  if (j.host !== undefined) cfg.host = String(j.host);
  if (j.upnp !== undefined) cfg.upnp = !!j.upnp;
  if (j.lan !== undefined) cfg.lan = !!j.lan;
  if (j.client !== undefined) cfg.client = String(j.client);
  if (j.adminToken !== undefined) cfg.adminToken = String(j.adminToken);
  return { cfg };
}

/** The settings in force, and where each came from. */
export function resolveConfig(
  args: string[],
  env: Record<string, string | undefined>,
  readFile: (p: string) => string | null,
  home = process.cwd(),
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
      const c = cleanConfig(JSON.parse(raw));
      if (c.error) fileError = `${file}: ${c.error} (that setting uses its default)`;
      for (const [k, v] of Object.entries(c.cfg)) set(k as keyof DedicatedConfig, v as never, "config");
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
  if (env.FTL_ARENA_ADMIN_TOKEN) set("adminToken", env.FTL_ARENA_ADMIN_TOKEN, "env");
  if (arg("--admin-token")) set("adminToken", arg("--admin-token")!, "argument");
  return { cfg, from, file, fileError };
}

