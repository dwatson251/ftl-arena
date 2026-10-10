/**
 * Finding a match on the local network by its code alone. Every server answers UDP questions on DISCOVERY_PORT;
 * a joiner's own server asks the whole network "who has code ABCD?" (broadcast) and only servers holding that
 * match reply, with their game port. No reply from anyone else, so a code never lands you in the wrong game.
 * Some networks drop broadcasts (mesh Wi-Fi, client isolation for UDP, a PC sending them out a virtual adapter),
 * so when nobody answers, the joiner's server asks every address on its own subnets directly over TCP instead
 * (GET /api/has?code=), on the usual game ports.
 */
import { createSocket, type Socket } from "node:dgram";
import { get as httpGet } from "node:http";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";

export const LAN_TAG = "ftl-arena-lan/1";
export const DISCOVERY_PORT = 47878;
const TAG = LAN_TAG;

export interface LanMatch {
  /** Where to connect: the replying server's address as seen from here, and its game port. */
  address: string;
  port: number;
  /** One id per server, so the same server heard on two interfaces counts once. */
  server: string;
  host: string;
  players: number;
}

/** Answer "who has this code?" for this server's matches. `find` returns null for codes it doesn't hold. */
export function lanResponder(id: string, port: () => number, find: (code: string) => { host: string; players: number } | null, log?: (s: string) => void): Socket {
  const s = createSocket({ type: "udp4", reuseAddr: true });
  s.on("message", (buf, from) => {
    let q: { tag?: string; q?: string; code?: string; nonce?: string };
    try {
      q = JSON.parse(buf.toString());
    } catch {
      return;
    }
    if (q.tag !== TAG || q.q !== "find" || typeof q.code !== "string") return;
    const m = find(q.code.toUpperCase());
    if (!m) return;
    log?.(`[${q.code.toUpperCase()}] found by a LAN search from ${from.address}`);
    const reply = Buffer.from(JSON.stringify({ tag: TAG, r: "found", code: q.code, nonce: q.nonce, port: port(), server: id, ...m }));
    s.send(reply, from.port, from.address);
  });
  s.on("error", (e) => {
    log?.(`LAN search answering is off (UDP ${DISCOVERY_PORT}: ${e.message}); the direct sweep and joining by address still work`);
    try {
      s.close();
    } catch {}
  });
  s.bind(DISCOVERY_PORT, () => {
    try {
      s.setBroadcast(true);
    } catch {}
  });
  return s;
}

/** Every broadcast address worth asking: the global one, each LAN's own, and this machine. */
function targets(): string[] {
  const out = new Set(["255.255.255.255", "127.0.0.1"]);
  for (const a of Object.values(networkInterfaces()).flat()) {
    if (!a || a.family !== "IPv4" || a.internal) continue;
    const ip = a.address.split(".").map(Number);
    const mask = a.netmask.split(".").map(Number);
    out.add(ip.map((b, i) => (b | (~mask[i] & 255)) & 255).join("."));
  }
  return [...out];
}

/** Find `code` on the network: a broadcast first, then (nobody answered) a direct sweep of the local subnets. */
export async function lanFind(code: string, log?: (s: string) => void): Promise<LanMatch[]> {
  const heard = await lanBroadcast(code);
  if (heard.length) return heard;
  const swept = await lanSweep(code);
  log?.(`LAN search for ${code.toUpperCase()}: no broadcast answers; direct sweep found ${swept.length}`);
  return swept;
}

/** Game ports tried by the sweep: the default and the next few (a busy port moves the app up one). */
const SWEEP_PORTS = [8787, 8788, 8789];

/** The /24 around each of this machine's private IPv4 addresses (a home network), at most 4 of them. */
function subnets(): string[] {
  const out = new Set<string>();
  for (const a of Object.values(networkInterfaces()).flat()) {
    if (!a || a.family !== "IPv4" || a.internal) continue;
    if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) continue;
    out.add(a.address.split(".").slice(0, 3).join("."));
  }
  return [...out].slice(0, 4);
}

function probe(host: string, port: number, code: string, ms: number): Promise<LanMatch | null> {
  return new Promise((resolve) => {
    const req = httpGet({ host, port, path: `/api/has?code=${encodeURIComponent(code)}`, timeout: ms }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => {
        try {
          const j = JSON.parse(b);
          resolve(r.statusCode === 200 && j.tag === TAG ? { address: host, port, server: String(j.server), host: String(j.host ?? ""), players: Number(j.players ?? 0) } : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

/** Ask every address on the local subnets directly (TCP), many at a time. */
async function lanSweep(code: string, ms = 900): Promise<LanMatch[]> {
  const jobs: [string, number][] = [];
  for (const net of subnets()) for (let i = 1; i < 255; i++) for (const p of SWEEP_PORTS) jobs.push([`${net}.${i}`, p]);
  const found = new Map<string, LanMatch>();
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [h, p] = jobs[next++];
      const m = await probe(h, p, code, ms);
      if (m && !found.has(m.server)) found.set(m.server, m);
    }
  };
  await Promise.all(Array.from({ length: 160 }, worker));
  return [...found.values()];
}

/** Ask the network (broadcast) who holds `code`; resolves after `ms` with each distinct server that answered. */
function lanBroadcast(code: string, ms = 1200): Promise<LanMatch[]> {
  return new Promise((resolve) => {
    const nonce = randomBytes(6).toString("hex");
    const found = new Map<string, LanMatch>();
    const s = createSocket("udp4");
    const done = () => {
      try {
        s.close();
      } catch {}
      resolve([...found.values()]);
    };
    s.on("error", done);
    s.on("message", (buf, from) => {
      try {
        const r = JSON.parse(buf.toString());
        if (r.tag !== TAG || r.r !== "found" || r.nonce !== nonce) return;
        const prev = found.get(r.server);
        // Heard twice (loopback and LAN): loopback is the sure way back to this same machine.
        if (prev && prev.address === "127.0.0.1") return;
        found.set(r.server, { address: from.address, port: Number(r.port), server: r.server, host: String(r.host ?? ""), players: Number(r.players ?? 0) });
      } catch {}
    });
    s.bind(0, () => {
      s.setBroadcast(true);
      const q = Buffer.from(JSON.stringify({ tag: TAG, q: "find", code: code.toUpperCase(), nonce }));
      for (const t of targets()) s.send(q, DISCOVERY_PORT, t, () => {});
      setTimeout(done, ms);
    });
  });
}
