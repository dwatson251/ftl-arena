/** A/B one bot's skill overrides against level 0.5 on the Kestrel, 40 seeds: npx tsx tools/bench/ab.ts */
import { resolve } from "node:path";
import { loadDb } from "@ftl/extract";
import { Bot, botLoadout, botSkills, Match, type BotSkills } from "@ftl/sim";
const db = loadDb(resolve("assets-local"));
const ship = "PLAYER_SHIP_HARD";
function score(ov: Partial<BotSkills>, seeds = 40) {
  let w = 0;
  for (let s = 1; s <= seeds; s++) {
    const lo = botLoadout(db, ship, 300, 1, s);
    const flip = s % 2 === 0;
    const m = new Match(db, { winCondition: "hull", scrap: 300, shipPool: [], timeLimit: 300, seed: s }, [lo, lo], ["a", "b"]);
    const test = new Bot(1, s * 3, ov), ref = new Bot(0.5, s * 3 + 1);
    const bots = flip ? [ref, test] : [test, ref];
    while (!m.over) { for (const p of [0, 1] as const) for (const c of bots[p].think(m, p)) m.push(p, c); m.step(); }
    w += m.state.winner === -1 ? 0.5 : m.state.winner === (flip ? 1 : 0) ? 1 : 0;
  }
  return Math.round((w / seeds) * 100);
}
const half = botSkills(0.5);
const cases: [string, Partial<BotSkills>][] = [["control 0.5", half], ["1.0", {}], ["1.0 -missileRule", { missilesOnShields: false }], ["1.0 -beamRule", { beamAfterShields: false }], ["1.0 -sync", { syncVolleys: false }], ["0.5 +fast", { ...half, thinkEvery: 0.3, mistake: 0 }]];
for (const [n, o] of cases) console.log(n.padEnd(20), score(o) + "%");
