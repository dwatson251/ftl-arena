/**
 * Difficulty ladder: bot level A vs level B over many seeds, same hull and scrap for both.
 *   npx tsx tools/bench/ladder.ts [--ship PLAYER_SHIP_HARD] [--scrap 300] [--seeds 20] [--placeholder]
 */
import { resolve } from "node:path";
import { placeholderDb } from "@ftl/data";
import { loadDb } from "@ftl/extract";
import { Bot, botLoadout, Match, TICK_HZ } from "@ftl/sim";

const args = process.argv.slice(2);
const get = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const db = args.includes("--placeholder") ? placeholderDb() : loadDb(resolve("assets-local"));
const ship = get("--ship", db.hangar[0]);
const scrap = Number(get("--scrap", "300"));
const seeds = Number(get("--seeds", "20"));
const levels = get("--levels", "0,0.25,0.5,0.75,1").split(",").map(Number);

function play(la: number, lb: number, seed: number) {
  const loads = [botLoadout(db, ship, scrap, la, seed), botLoadout(db, ship, scrap, lb, seed)] as const;
  // Same hull and spend for both sides would hide the hangar skill; give both the stronger plan so only play differs.
  const m = new Match(db, { winCondition: "hull", scrap, shipPool: [], timeLimit: 300, seed }, [loads[1], loads[1]], ["a", "b"]);
  const bots = [new Bot(la, seed * 2 + 1), new Bot(lb, seed * 2 + 2)];
  while (!m.over) {
    for (const p of [0, 1] as const) for (const c of bots[p].think(m, p)) m.push(p, c);
    m.step();
  }
  return { w: m.state.winner, t: m.state.tick / TICK_HZ };
}

console.log(`${ship}, ${scrap} scrap, ${seeds} seeds; cell = win % of the row level vs the column level (draws count half)`);
console.log("      " + levels.map((l) => l.toFixed(2).padStart(6)).join(""));
for (const a of levels) {
  let row = a.toFixed(2).padStart(6);
  for (const b of levels) {
    let score = 0;
    let time = 0;
    for (let s = 1; s <= seeds; s++) {
      // Alternate sides so seat order can't bias the result.
      const flip = s % 2 === 0;
      const r = flip ? play(b, a, s) : play(a, b, s);
      const aWon = r.w === -1 ? 0.5 : (r.w === 0) !== flip ? 1 : 0;
      score += aWon;
      time += r.t;
    }
    row += `${Math.round((score / seeds) * 100)}%`.padStart(6);
  }
  console.log(row);
}
