/** Bot vs bot on teleporter hulls: checks boarding happens and matches end. `npx tsx tools/bench/boarding.ts` */
import { resolve } from "node:path";
import { loadDb } from "@ftl/extract";
import { botLoadout, Bot, DEFAULT_CONFIG, Match } from "@ftl/sim";
const db = loadDb(resolve("assets-local"));
const hulls = db.hangar.filter((h) => db.ships[h].systems.some((s) => s.id === "teleporter" && s.start));
let boards = 0, kills = 0, ends = 0;
for (let i = 0; i < 12; i++) {
  const a = hulls[i % hulls.length], b = hulls[(i + 1) % hulls.length];
  const cfg = { ...DEFAULT_CONFIG, winCondition: (i % 2 ? "crew" : "hull") as "crew" | "hull", seed: i + 1 };
  const m = new Match(db, cfg, [botLoadout(db, a, 300, 0.8, i), botLoadout(db, b, 300, 0.8, i + 7)], ["a", "b"]);
  const bots = [new Bot(0.8, i), new Bot(0.8, i + 3)];
  for (let t = 0; t < 30 * 300 && m.state.winner === null; t++) {
    for (const p of [0, 1] as const) for (const c of bots[p].think(m, p)) m.push(p, c);
    m.step();
    for (const e of m.state.events) {
      if (e.e === "teleport" && e.out) boards++;
      if (e.e === "death") kills++;
    }
  }
  if (m.state.winner !== null) ends++;
  console.log(`${a} vs ${b} (${cfg.winCondition}): winner ${m.state.winner} ${m.state.endReason} at ${(m.state.tick / 30).toFixed(0)}s`);
}
console.log({ boards, kills, ends });
