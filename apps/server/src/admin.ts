/**
 * The server's admin side: a JSON API for monitoring and settings, and a small web page on top of it
 * (http://<server>/admin). Requests from this machine are always allowed; from anywhere else they need the
 * admin token (`Authorization: Bearer <token>` or `?token=`), and with no token set remote admin is off.
 *   GET  /api/admin/status            version, uptime, port, players online, lobbies, battles
 *   GET  /api/admin/lobbies           each lobby: code, phase, mode, players (connected, ready, ship), battle time
 *   GET  /api/admin/logs?since=<n>    log lines after line n (and the next n to ask from)
 *   GET  /api/admin/config            the settings (when the host program has some to offer)
 *   PUT  /api/admin/config            save new settings (JSON body); some only apply after a restart
 *   POST /api/admin/close?code=ABCD   close a lobby (its players go back to the menu)
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Lobby } from "./lobby.ts";

declare const __APP_VERSION__: string | undefined;
export const SERVER_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : process.env.FTL_ARENA_VERSION ?? "dev";

/** What the program running the server (the dedicated server, its desktop app) lets the admin side do. */
export interface AdminHooks {
  /** Required for anyone not on this machine. Empty or missing: remote admin is off. */
  token?: () => string;
  getConfig?: () => unknown;
  /** Save new settings; `restart`: they only apply once the server restarts. */
  setConfig?: (c: unknown) => { ok: boolean; error?: string; restart?: boolean };
}

export interface LogLine {
  n: number;
  t: number;
  text: string;
}

export interface AdminContext {
  lobbies: Map<string, Lobby>;
  logs: LogLine[];
  startedAt: number;
  port: () => number;
  online: () => number;
  close: (code: string) => boolean;
  shipTitle: (id: string) => string;
  hooks: AdminHooks;
}

const isLocal = (req: IncomingMessage) => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress ?? "");

export function authorised(req: IncomingMessage, query: URLSearchParams, hooks: AdminHooks): boolean {
  if (isLocal(req)) return true;
  const token = hooks.token?.() ?? "";
  if (!token) return false;
  const given = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || query.get("token") || "";
  return given === token;
}

/** A lobby as the admin side shows it. */
export function lobbySummary(l: Lobby, shipTitle: (id: string) => string = (id) => id) {
  const m = l.match;
  return {
    code: l.code,
    phase: l.phase,
    mode: l.config.survival ? "survival" : l.practice ? "practice" : "arena",
    mods: l.config.mods ?? [],
    players: l.players.map((p) => ({ name: p.name, bot: !!p.bot, connected: p.connected, ready: p.ready, controller: !!p.controller, ship: p.loadout ? shipTitle(p.loadout.ship) : null })),
    battle: m ? { seconds: Math.round(m.state.tick / 30), hull: m.state.ships.map((s) => [s.hull, s.maxHull]), winner: m.state.winner } : null,
  };
}

/** Handle an admin request; false when the URL isn't one. */
export function adminRoute(req: IncomingMessage, res: ServerResponse, url: string, query: URLSearchParams, ctx: AdminContext): boolean {
  if (url === "/admin" || url === "/admin/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" }).end(ADMIN_PAGE);
    return true;
  }
  if (!url.startsWith("/api/admin/")) return false;
  const send = (code: number, v: unknown) => res.writeHead(code, { "content-type": "application/json", "cache-control": "no-cache" }).end(JSON.stringify(v));
  if (!authorised(req, query, ctx.hooks)) {
    send(ctx.hooks.token?.() ? 401 : 403, { error: ctx.hooks.token?.() ? "admin token needed" : "remote admin is off (set adminToken in the server's settings)" });
    return true;
  }
  const what = url.slice("/api/admin/".length);
  if (what === "status" && req.method === "GET") {
    const ls = [...ctx.lobbies.values()];
    send(200, {
      version: SERVER_VERSION, uptime: Math.round((Date.now() - ctx.startedAt) / 1000), port: ctx.port(), online: ctx.online(),
      lobbies: ls.length, battles: ls.filter((l) => l.phase === "battle").length,
      players: ls.reduce((a, l) => a + l.players.filter((p) => !p.bot && p.connected).length, 0),
    });
  } else if (what === "lobbies" && req.method === "GET") send(200, [...ctx.lobbies.values()].map((l) => lobbySummary(l, ctx.shipTitle)));
  else if (what === "logs" && req.method === "GET") {
    const since = Number(query.get("since") ?? -1);
    const lines = ctx.logs.filter((l) => l.n > since);
    send(200, { lines, next: lines.length ? lines[lines.length - 1].n : since });
  } else if (what === "config" && req.method === "GET") {
    if (!ctx.hooks.getConfig) send(404, { error: "this server has no settings to show" });
    else send(200, ctx.hooks.getConfig());
  } else if (what === "config" && req.method === "PUT") {
    if (!ctx.hooks.setConfig) {
      send(404, { error: "this server's settings can't be changed here" });
      return true;
    }
    let body = "";
    req.on("data", (d) => {
      body += d;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const r = ctx.hooks.setConfig!(JSON.parse(body || "{}"));
        send(r.ok ? 200 : 400, r);
      } catch (e) {
        send(400, { ok: false, error: (e as Error).message });
      }
    });
  } else if (what === "close" && req.method === "POST") {
    const ok = ctx.close(String(query.get("code") ?? "").toUpperCase());
    send(ok ? 200 : 404, { ok });
  } else send(404, { error: "unknown admin request" });
  return true;
}

/** The admin page: one self-contained file over the API (works from this machine, or remotely with the token). */
export const ADMIN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>FTL Arena server</title>
<style>
:root { --bg:#0b0d12; --panel:#1b1f27; --edge:#3a4150; --text:#e9ecf1; --dim:#9aa3b2; --ok:#7bd47b; --bad:#ef5b5b; --accent:#78b9ff; }
body { margin:0; background:var(--bg); color:var(--text); font:14px system-ui, sans-serif; }
header { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--edge); }
header h1 { font-size:16px; margin:0; } header .dim { color:var(--dim); }
main { display:grid; grid-template-columns: 1fr 1fr; gap:12px; padding:12px 16px; }
section { background:var(--panel); border:1px solid var(--edge); padding:10px 12px; min-width:0; }
section h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--dim); margin:0 0 8px; }
.stats { display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; } .stat b { display:block; font-size:20px; }
.stat span { color:var(--dim); font-size:12px; }
table { width:100%; border-collapse:collapse; } td, th { text-align:left; padding:4px 6px; border-bottom:1px solid var(--edge); font-size:13px; vertical-align:top; }
.on { color:var(--ok); } .off { color:var(--bad); }
#log { height:320px; overflow:auto; font:12px ui-monospace, monospace; white-space:pre-wrap; background:#0e1116; padding:6px; }
label { display:flex; justify-content:space-between; gap:8px; margin:6px 0; } input { background:#0e1116; color:var(--text); border:1px solid var(--edge); padding:4px 6px; }
button { background:#262b33; color:var(--text); border:1px solid var(--edge); padding:4px 10px; cursor:pointer; } button:hover { border-color:var(--accent); }
.wide { grid-column: 1 / -1; } .note { color:var(--dim); font-size:12px; } #msg { color:var(--accent); }
@media (max-width: 800px) { main { grid-template-columns: 1fr; } }
</style></head><body>
<header><h1>FTL Arena server</h1><span class="dim" id="ver"></span><span style="flex:1"></span><span id="msg"></span></header>
<main>
<section><h2>Status</h2><div class="stats" id="stats"></div></section>
<section><h2>Settings</h2><form id="cfg"></form><div class="note" id="cfgnote"></div></section>
<section class="wide"><h2>Lobbies and players</h2><table><thead><tr><th>Code</th><th>Mode</th><th>Phase</th><th>Players</th><th>Battle</th><th></th></tr></thead><tbody id="lobbies"></tbody></table></section>
<section class="wide"><h2>Log</h2><div id="log"></div></section>
</main>
<script>
const params = new URLSearchParams(location.search);
let token = params.get("token") || localStorage.getItem("ftl-arena-admin-token") || "";
const api = async (path, opts = {}) => {
  const r = await fetch("/api/admin/" + path, { ...opts, headers: { ...(opts.headers || {}), ...(token ? { authorization: "Bearer " + token } : {}) } });
  if (r.status === 401 || r.status === 403) {
    const j = await r.json().catch(() => ({}));
    const t = prompt((j.error || "Admin token needed") + "\\n\\nAdmin token:");
    if (t) { token = t; localStorage.setItem("ftl-arena-admin-token", t); }
    throw new Error("unauthorised");
  }
  return r.json();
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (s) => s >= 3600 ? Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m" : s >= 60 ? Math.floor(s / 60) + "m " + (s % 60) + "s" : s + "s";
let since = -1;
async function tick() {
  try {
    const s = await api("status");
    document.getElementById("ver").textContent = "v" + s.version + " · port " + s.port;
    document.getElementById("stats").innerHTML = [["Players", s.players], ["Online", s.online], ["Lobbies", s.lobbies], ["Battles", s.battles], ["Uptime", fmt(s.uptime)]]
      .map(([k, v]) => '<div class="stat"><b>' + esc(v) + "</b><span>" + k + "</span></div>").join("");
    const ls = await api("lobbies");
    document.getElementById("lobbies").innerHTML = ls.length ? ls.map((l) => "<tr><td><b>" + esc(l.code) + "</b></td><td>" + esc(l.mode) + (l.mods.length ? " · " + esc(l.mods.join(", ")) : "") + "</td><td>" + esc(l.phase) + "</td><td>" +
      l.players.map((p) => '<span class="' + (p.connected ? "on" : "off") + '">●</span> ' + esc(p.name) + (p.bot ? " (bot)" : "") + (p.ready ? " ✓" : "") + (p.ship ? ' <span class="note">' + esc(p.ship) + "</span>" : "")).join("<br>") +
      "</td><td>" + (l.battle ? fmt(l.battle.seconds) + " · hull " + l.battle.hull.map((h) => h[0] + "/" + h[1]).join(" vs ") : "") + '</td><td><button data-close="' + esc(l.code) + '">Close</button></td></tr>').join("")
      : '<tr><td colspan="6" class="note">No lobbies open.</td></tr>';
    const lg = await api("logs?since=" + since);
    const box = document.getElementById("log");
    const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
    for (const l of lg.lines) box.append(new Date(l.t).toTimeString().slice(0, 8) + "  " + l.text + "\\n");
    since = lg.next;
    if (atEnd) box.scrollTop = box.scrollHeight;
  } catch (e) {}
}
async function loadConfig() {
  const f = document.getElementById("cfg");
  try {
    const c = await api("config");
    if (c.error) { f.innerHTML = '<div class="note">' + esc(c.error) + "</div>"; return; }
    f.innerHTML = Object.entries(c).map(([k, v]) => "<label>" + esc(k) + (typeof v === "boolean" ? '<input type="checkbox" name="' + k + '"' + (v ? " checked" : "") + ">" : '<input name="' + k + '" value="' + esc(v) + '"' + (typeof v === "number" ? ' type="number"' : "") + ">") + "</label>").join("") + "<button>Save</button>";
    f.onsubmit = async (e) => {
      e.preventDefault();
      const out = {};
      for (const [k, v] of Object.entries(c)) { const el = f.elements[k]; out[k] = typeof v === "boolean" ? el.checked : typeof v === "number" ? Number(el.value) : el.value; }
      const r = await api("config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(out) });
      document.getElementById("cfgnote").textContent = r.ok ? (r.restart ? "Saved. Restart the server to apply." : "Saved.") : "Not saved: " + (r.error || "?");
    };
  } catch (e) {}
}
document.addEventListener("click", async (e) => {
  const code = e.target.dataset && e.target.dataset.close;
  if (!code || !confirm("Close lobby " + code + "? Its players go back to the menu.")) return;
  await api("close?code=" + code, { method: "POST" });
  document.getElementById("msg").textContent = "Closed " + code;
  tick();
});
tick(); loadConfig(); setInterval(tick, 2000);
</script></body></html>`;
