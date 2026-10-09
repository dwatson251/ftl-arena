/** Difficulty curve: the slider (0-100) vs a steady level-0.6 player on the Kestrel, 20 seeds each.
 *  npx tsx tools/bench/difficulty.ts */
import { resolve } from "node:path";
import { loadDb } from "@ftl/extract";
import { Bot, botLoadout, difficultyToBot, Match } from "@ftl/sim";
const db = loadDb(resolve("assets-local"));
const ship = "PLAYER_SHIP_HARD";
// A fixed "player": level 0.6 bot with the base 300 scrap. Opponent: the slider.
for (const d of [0, 20, 40, 60, 80, 100]) {
  const { level, scrapBonus } = difficultyToBot(d);
  let w = 0;
  const N = 20;
  for (let s = 1; s <= N; s++) {
    const me = botLoadout(db, ship, 300, 0.6, s);
    const bot = botLoadout(db, ship, Math.round(300 * (1 + scrapBonus)), level, s);
    const m = new Match(db, { winCondition: "hull", scrap: 300, shipPool: [], timeLimit: 300, seed: s }, [me, bot], ["me", "bot"]);
    const bots = [new Bot(0.6, s), new Bot(level, s + 50)];
    while (!m.over) { for (const p of [0, 1] as const) for (const c of bots[p].think(m, p)) m.push(p, c); m.step(); }
    w += m.state.winner === 1 ? 1 : m.state.winner === -1 ? 0.5 : 0;
  }
  console.log(`difficulty ${String(d).padStart(3)}: bot wins ${Math.round((w / N) * 100)}% vs a steady level-0.6 player`);
}
