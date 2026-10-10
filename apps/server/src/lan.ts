/**
 * Finding a match on the local network by its code alone. Every server answers UDP questions on DISCOVERY_PORT;
 * a joiner's own server asks the whole network "who has code ABCD?" (broadcast) and only servers holding that
 * match reply, with their game port. No reply from anyone else, so a code never lands you in the wrong game.
 */
import { createSocket, type Socket } from "node:dgram";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";

export const DISCOVERY_PORT = 47878;
const TAG = "ftl-arena-lan/1";

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
export function lanResponder(port: () => number, find: (code: string) => { host: string; players: number } | null): Socket {
  const id = randomBytes(6).toString("hex");
  const s = createSocket({ type: "udp4", reuseAddr: true });
  s.on("error", () => s.close());
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
    const reply = Buffer.from(JSON.stringify({ tag: TAG, r: "found", code: q.code, nonce: q.nonce, port: port(), server: id, ...m }));
    s.send(reply, from.port, from.address);
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

/** Ask the network who holds `code`; resolves after `ms` with each distinct server that answered. */
export function lanFind(code: string, ms = 1200): Promise<LanMatch[]> {
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
