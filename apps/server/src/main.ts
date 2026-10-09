/**
 * FTL Arena server: one process hosts every lobby. Serves the built client and the owner's extracted
 * assets over HTTP, and the game over a WebSocket at /ws.
 *   npm run server -- [--port 8787] [--assets assets-local]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { loadDb } from "@ftl/extract";
import { decode, encode, PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from "@ftl/protocol";
import { TICK_HZ } from "@ftl/sim";
import { Lobby, type Client } from "./lobby.ts";

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = Number(arg("--port", process.env.PORT ?? "8787"));
const ASSETS = resolve(arg("--assets", "assets-local"));
const CLIENT = resolve("apps/client/dist");
const db = loadDb(ASSETS);
console.log(`game data: ${db.source} (${db.hangar.length} hulls, ${Object.keys(db.weapons).length} weapons)`);

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".json": "application/json", ".xml": "text/xml", ".txt": "text/plain", ".svg": "image/svg+xml",
};

function serveFile(root: string, rel: string, res: import("node:http").ServerResponse): boolean {
  const p = normalize(join(root, rel));
  if (!p.startsWith(root) || !existsSync(p) || !statSync(p).isFile()) return false;
  res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream", "cache-control": "max-age=3600" });
  createReadStream(p).pipe(res);
  return true;
}

const http = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url.startsWith("/assets/") && serveFile(ASSETS, url.slice(8), res)) return;
  if (!url.startsWith("/assets/") && existsSync(CLIENT)) {
    if (serveFile(CLIENT, url === "/" ? "index.html" : url.slice(1), res)) return;
    if (serveFile(CLIENT, "index.html", res)) return;
  }
  res.writeHead(404).end("not found");
});

const lobbies = new Map<string, Lobby>();
const sessions = new Map<string, Client>();
const newCode = () => {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let c = "";
  do c = Array.from({ length: 4 }, () => A[(Math.random() * A.length) | 0]).join("");
  while (lobbies.has(c));
  return c;
};

const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 64 * 1024, perMessageDeflate: true });
wss.on("connection", (ws: WebSocket) => {
  let client: Client | null = null;
  const send = (m: ServerMsg) => ws.readyState === ws.OPEN && ws.send(encode(m));
  const err = (msg: string | null) => {
    if (!msg) return;
    if (process.env.ARENA_DEBUG) console.log(`[${client?.name ?? "?"}] error: ${msg}`);
    send({ t: "error", msg });
  };
  ws.on("message", (raw) => {
    let m: ClientMsg;
    try {
      m = decode<ClientMsg>(raw.toString());
    } catch {
      return err("bad message");
    }
    if (m.t === "hello") {
      if (m.v !== PROTOCOL_VERSION) return err(`protocol ${m.v} != server ${PROTOCOL_VERSION}; update your client`);
      const old = m.token ? sessions.get(m.token) : undefined;
      const name = String(m.name || "Captain").slice(0, 24);
      client = old ?? { id: randomBytes(9).toString("base64url"), name, send, lobby: null };
      client.send = send;
      client.name = name;
      sessions.set(client.id, client);
      send({ t: "welcome", v: PROTOCOL_VERSION, token: client.id, db });
      if (client.lobby) client.lobby.join(client);
      else send({ t: "lobby", lobby: null });
      return;
    }
    if (!client) return err("say hello first");
    const c = client;
    switch (m.t) {
      case "create": {
        if (c.lobby) c.lobby.leave(c, true);
        const code = newCode();
        const l = new Lobby(code, c.id, db, m.config ?? {}, !!m.practice);
        lobbies.set(code, l);
        return err(l.join(c));
      }
      case "join": {
        const l = lobbies.get(String(m.code).toUpperCase());
        if (!l) return err("no lobby with that code");
        if (c.lobby && c.lobby !== l) c.lobby.leave(c, true);
        return err(l.join(c));
      }
      case "leave":
        c.lobby?.leave(c, true);
        return send({ t: "lobby", lobby: null });
      case "config":
        return err(c.lobby ? c.lobby.setConfig(c, m.config) : "not in a lobby");
      case "loadout":
        return err(c.lobby ? c.lobby.setLoadout(c, m.loadout) : "not in a lobby");
      case "ready":
        return err(c.lobby ? c.lobby.setReady(c, m.ready) : "not in a lobby");
      case "cmd":
        return c.lobby?.command(c, m.cmd);
      case "practice":
        return err(c.lobby ? c.lobby.setPractice(c, m.practice) : "not in a lobby");
      case "debug":
        return err(c.lobby ? c.lobby.debug(c, m.d) : "not in a lobby");
      case "rematch":
        return c.lobby?.rematch(c);
    }
  });
  ws.on("close", () => {
    if (client?.lobby) client.lobby.leave(client, false);
  });
});

// Fixed-step loop with an accumulator, so a slow tick doesn't slow the game clock.
const STEP = 1000 / TICK_HZ;
let last = performance.now();
let acc = 0;
let secAcc = 0;
setInterval(() => {
  const now = performance.now();
  acc += now - last;
  secAcc += now - last;
  last = now;
  let n = 0;
  while (acc >= STEP && n++ < 5) {
    acc -= STEP;
    for (const l of lobbies.values()) l.tick();
  }
  if (acc > STEP * 5) acc = 0;
  while (secAcc >= 1000) {
    secAcc -= 1000;
    for (const [code, l] of lobbies) {
      l.secondTick();
      if (l.clients.size === 0 && l.phase !== "battle") lobbies.delete(code);
    }
  }
}, 4);

http.listen(PORT, () => console.log(`FTL Arena server on http://localhost:${PORT}  (ws at /ws)`));
