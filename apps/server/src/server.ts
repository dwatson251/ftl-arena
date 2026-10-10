/**
 * FTL Arena server as a library: one process hosts every lobby. Serves the built client and the player's own
 * extracted assets over HTTP, and the game over a WebSocket at /ws. `main.ts` is its command line; the desktop
 * app starts it in-process.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { loadDb } from "@ftl/extract";
import { decode, encode, PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from "@ftl/protocol";
import { TICK_HZ } from "@ftl/sim";
import { Lobby, type Client } from "./lobby.ts";
import { forwardPort, lanAddresses, publicAddress, unforwardPort } from "./upnp.ts";
import { lanFind, lanResponder } from "./lan.ts";

export interface ServerOptions {
  /** TCP port (0 picks a free one). */
  port: number;
  /** The extracted FTL assets folder (the placeholder set is used when it has none). */
  assets: string;
  /** The built client to serve at / (optional: the dev client is served by Vite instead). */
  client?: string;
  /** Interface to listen on: every interface by default, so other players can reach a host. */
  host?: string;
  log?: (s: string) => void;
  /** Try to open the port on the router (UPnP) the first time someone asks how to share this server. */
  upnp?: boolean;
  /** Answer LAN "who has this code?" questions (default on). */
  lan?: boolean;
}

/** How other players reach this server: its port, LAN addresses, public address and whether UPnP worked. */
export interface ShareInfo {
  port: number;
  lan: string[];
  public: string;
  upnp: string;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ogg": "audio/ogg", ".font": "application/octet-stream",
  ".wav": "audio/wav", ".json": "application/json", ".xml": "text/xml", ".txt": "text/plain", ".svg": "image/svg+xml",
};

function serveFile(root: string, rel: string, res: import("node:http").ServerResponse, head = false): boolean {
  const p = normalize(join(root, rel));
  if (!p.startsWith(root) || !existsSync(p) || !statSync(p).isFile()) return false;
  res.writeHead(200, {
    "content-type": MIME[extname(p)] ?? "application/octet-stream", "content-length": statSync(p).size,
    // The page and the service worker must never be stale after a rebuild (built scripts have hashed names).
    "cache-control": /\.html$|sw\.js$|manifest\.json$/.test(p) ? "no-cache" : "max-age=3600",
  });
  // HEAD gets headers only: streaming a body to a HEAD request makes proxies (Vite's) abort it.
  if (head) res.end();
  else createReadStream(p).pipe(res);
  return true;
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const log = opts.log ?? ((s: string) => console.log(s));
  const ASSETS = resolve(opts.assets);
  const CLIENT = opts.client ? resolve(opts.client) : "";
  const db = loadDb(ASSETS);
  log(`game data: ${db.source} (${db.hangar.length} hulls, ${Object.keys(db.weapons).length} weapons)`);

  // The addresses to share, worked out once (on the first ask): LAN, public, and a UPnP port forward.
  let share: Promise<ShareInfo> | null = null;
  const shareInfo = (port: number): Promise<ShareInfo> =>
    (share ??= (async () => {
      let upnp = "off";
      let external = "";
      if (opts.upnp) {
        try {
          external = (await forwardPort(port)).external;
          upnp = "ok";
          log(`UPnP: the router forwards TCP ${port} here`);
        } catch (e) {
          upnp = `failed: ${(e as Error).message}`;
          log(`UPnP ${upnp} (forward TCP ${port} by hand for players on the internet)`);
        }
      }
      return { port, lan: lanAddresses(), public: external || (await publicAddress()), upnp };
    })());

  const http = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const head = req.method === "HEAD";
    const json = (v: unknown) => res.writeHead(200, { "content-type": "application/json", "cache-control": "no-cache" }).end(JSON.stringify(v));
    const query = new URLSearchParams((req.url ?? "").split("?")[1] ?? "");
    if (url === "/api/share") {
      const port = (http.address() as AddressInfo).port;
      // Online: the public address too (and the UPnP attempt). LAN: just this computer's network addresses.
      if (query.get("online") === "1") void shareInfo(port).then(json);
      else json({ port, lan: lanAddresses(), public: "", upnp: "off" } satisfies ShareInfo);
      return;
    }
    if (url === "/api/lan") {
      void lanFind(String(query.get("code") ?? "")).then(json);
      return;
    }
    if (url.startsWith("/assets/") && serveFile(ASSETS, url.slice(8), res, head)) return;
    if (!url.startsWith("/assets/") && CLIENT && existsSync(CLIENT)) {
      if (serveFile(CLIENT, url === "/" ? "index.html" : url.slice(1), res, head)) return;
      if (serveFile(CLIENT, "index.html", res, head)) return;
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
        if (!old) log(`${name} connected`);
        send({ t: "welcome", v: PROTOCOL_VERSION, token: client.id, db });
        // Back after a dropped connection or a reload: straight into the match that still holds your seat.
        client.lobby ??= [...lobbies.values()].find((l) => l.seated(client!.id)) ?? null;
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
          const l = new Lobby(code, c.id, db, m.config ?? {}, !!m.practice, (s) => log(`[${code}] ${s}`));
          lobbies.set(code, l);
          log(`[${code}] ${c.name} created a ${m.practice ? "practice " : ""}match (${lobbies.size} open)`);
          return err(l.join(c));
        }
        case "join": {
          const l = lobbies.get(String(m.code).trim().toUpperCase());
          if (!l) return err(`no match with code ${String(m.code).trim().toUpperCase() || "(blank)"} on this server`);
          if (c.lobby && c.lobby !== l) c.lobby.leave(c, true);
          const why = l.join(c);
          log(`[${l.code}] ${c.name} ${why ? `couldn't join: ${why}` : "joined"}`);
          return err(why);
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
      if (client) log(`${client.name} disconnected`);
      if (client?.lobby) client.lobby.leave(client, false);
    });
  });

  // Fixed-step loop with an accumulator, so a slow tick doesn't slow the game clock.
  const STEP = 1000 / TICK_HZ;
  let last = performance.now();
  let acc = 0;
  let secAcc = 0;
  const responder =
    opts.lan === false
      ? null
      : lanResponder(
          () => (http.address() as AddressInfo | null)?.port ?? opts.port,
          (code) => {
            const l = lobbies.get(code);
            if (!l || l.practice) return null;
            return { host: l.players.find((p) => p.id === l.host)?.name ?? "", players: l.players.length };
          },
        );
  const timer = setInterval(() => {
    const now = performance.now();
    acc += now - last;
    secAcc += now - last;
    last = now;
    let n = 0;
    while (acc >= STEP && n++ < 5) {
      acc -= STEP;
      for (const l of lobbies.values()) {
        // One lobby's bug must not take the whole server (and every other match) down.
        try {
          l.tick();
        } catch (err) {
          console.error("lobby tick failed:", err);
        }
      }
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

  return new Promise((ok, fail) => {
    // A port that's taken: stop everything this attempt started, and let the caller try another.
    wss.on("error", () => {});
    http.once("error", (e) => {
      clearInterval(timer);
      wss.close();
      try {
        responder?.close();
      } catch {}
      fail(e);
    });
    http.listen(opts.port, opts.host ?? "0.0.0.0", () => {
      const port = (http.address() as AddressInfo).port;
      log(`FTL Arena server on http://localhost:${port}  (ws at /ws)`);
      ok({
        port,
        close: () =>
          new Promise<void>((done) => {
            void unforwardPort();
            clearInterval(timer);
            try {
              responder?.close();
            } catch {}
            for (const c of wss.clients) c.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
