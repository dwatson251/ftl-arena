/** Real-data smoke test for the last systems and the flagship. `npx tsx tools/bench/final.ts` */
import { resolve } from "node:path";
import { loadDb } from "@ftl/extract";
import { botLoadout, Bot, DEFAULT_CONFIG, enemyLoadout, Match } from "@ftl/sim";
const db = loadDb(resolve("assets-local"));
console.log("flagship enemies:", db.enemies.filter((e) => /^BOSS_/.test(e)).map((e) => `${e}=${db.ships[e].title}`).join(", "));
const duel = (a: string, b: string, boss = false) => {
  const la = botLoadout(db, a, 300, 0.8, 3);
  const lb = boss ? enemyLoadout(db, b, 1, 5, 0) : botLoadout(db, b, 300, 0.8, 4);
  const m = new Match(db, { ...DEFAULT_CONFIG, seed: 9 }, [la, lb], ["a", "b"]);
  const bots = [new Bot(0.8, 1), new Bot(0.8, 2)];
  const seen = new Map<string, number>();
  for (let t = 0; t < 30 * 240 && m.state.winner === null; t++) {
    for (const p of [0, 1] as const) for (const c of bots[p].think(m, p)) m.push(p, c);
    m.step();
    for (const e of m.state.events) {
      const k = e.e === "fire" && (e as { slot: number }).slot <= -2 ? `artillery(${e.ship})` : e.e === "battery" || e.e === "mind" || e.e === "teleport" || e.e === "hackPulse" || e.e === "cloak" ? `${e.e}(${(e as { ship: number }).ship})` : "";
      if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  console.log(`${a} vs ${b}: winner ${m.state.winner} (${m.state.endReason}) at ${(m.state.tick / 30).toFixed(0)}s`, Object.fromEntries(seen));
};
duel("PLAYER_SHIP_FED", "PLAYER_SHIP_JELLY_3");
duel("PLAYER_SHIP_ENERGY_3", "PLAYER_SHIP_ANAEROBIC_2");
for (const b of ["BOSS_1", "BOSS_2", "BOSS_3"]) duel("PLAYER_SHIP_HARD", b, true);
