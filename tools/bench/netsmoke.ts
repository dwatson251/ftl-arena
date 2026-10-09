/** Network smoke test: two scripted clients create/join a lobby, ready up, fight for a while over /ws. */
import WebSocket from "ws";
import { encode, PROTOCOL_VERSION, type ServerMsg } from "@ftl/protocol";

const URL = process.argv[2] ?? "ws://localhost:8787/ws";
const secs = Number(process.argv[3] ?? "20");
function client(name: string) {
  const ws = new WebSocket(URL);
  const msgs: ServerMsg[] = [];
  const waiters: [(m: ServerMsg) => boolean, (m: ServerMsg) => void][] = [];
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString()) as ServerMsg;
    msgs.push(m);
    for (const w of [...waiters]) if (w[0](m)) { waiters.splice(waiters.indexOf(w), 1); w[1](m); }
  });
  const wait = (f: (m: ServerMsg) => boolean) => new Promise<ServerMsg>((r) => waiters.push([f, r]));
  const open = new Promise((r) => ws.on("open", r));
  return { ws, msgs, wait, open, send: (m: object) => ws.send(encode(m as never)), name };
}
const a = client("Alice");
const b = client("Bob");
await Promise.all([a.open, b.open]);
a.send({ t: "hello", v: PROTOCOL_VERSION, name: "Alice" });
b.send({ t: "hello", v: PROTOCOL_VERSION, name: "Bob" });
const w = (await a.wait((m) => m.t === "welcome")) as Extract<ServerMsg, { t: "welcome" }>;
console.log("db", w.db.source, w.db.hangar.length, "hulls", (JSON.stringify(w.db).length / 1024).toFixed(0), "KB");
a.send({ t: "create", config: { winCondition: "hull", scrap: 300, timeLimit: secs } });
const lob = (await a.wait((m) => m.t === "lobby" && !!m.lobby)) as Extract<ServerMsg, { t: "lobby" }>;
b.send({ t: "join", code: lob.lobby!.code });
await b.wait((m) => m.t === "lobby" && m.lobby?.players.length === 2);
const lo = lob.lobby!.players[0].loadout!;
b.send({ t: "loadout", loadout: { ...lo, systems: { ...lo.systems, shields: 4 } } });
a.send({ t: "ready", ready: true });
b.send({ t: "ready", ready: true });
const errs = [...a.msgs, ...b.msgs].filter((m) => m.t === "error");
const sa = (await a.wait((m) => m.t === "start")) as Extract<ServerMsg, { t: "start" }>;
console.log("started, Alice is", sa.you, "errors so far", errs);
const t0 = Date.now();
for (const c of [a, b]) {
  c.send({ t: "cmd", cmd: { c: "weaponPower", slot: 1, on: true } });
  c.send({ t: "cmd", cmd: { c: "autofire", slot: 0, on: true } });
  c.send({ t: "cmd", cmd: { c: "autofire", slot: 1, on: true } });
  c.send({ t: "cmd", cmd: { c: "target", slot: 0, target: { kind: "room", room: 5 } } });
  c.send({ t: "cmd", cmd: { c: "target", slot: 1, target: { kind: "room", room: 5 } } });
}
const end = (await a.wait((m) => m.t === "snap" && m.view.winner !== null)) as Extract<ServerMsg, { t: "snap" }>;
const snaps = a.msgs.filter((m) => m.t === "snap") as Extract<ServerMsg, { t: "snap" }>[];
const dt = (Date.now() - t0) / 1000;
console.log(`ended after ${dt.toFixed(1)} s wall, tick ${end.view.tick} (${(end.view.tick / dt).toFixed(1)} ticks/s), ${snaps.length} snaps (${(snaps.length / dt).toFixed(1)}/s), winner ${end.view.winner} "${end.view.endReason}"`);
const mid = snaps[Math.floor(snaps.length / 2)].view;
console.log("Alice sees enemy interior:", mid.ships[1 - mid.you].interior, "enemy crew sent:", mid.ships[1 - mid.you].crew.length, "own crew:", mid.ships[mid.you].crew.length);
console.log("hulls", end.view.ships.map((s) => s.hull), "events seen", snaps.reduce((n, s) => n + s.view.events.length, 0));
console.log("avg snap bytes", (snaps.reduce((n, s) => n + JSON.stringify(s).length, 0) / snaps.length).toFixed(0));
a.ws.close(); b.ws.close();
