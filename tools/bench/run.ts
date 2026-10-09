/**
 * Headless match bench: bot vs bot, no UI, no network.
 *   npm run bench -- [--ship A] [--ship2 B] [--win hull|crew] [--seed N] [--placeholder] [--trace out.jsonl]
 * Prints the result, timings and the final state hash; same args give the same hash.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { placeholderDb } from "@ftl/data";
import { loadDb } from "@ftl/extract";
import { baseLoadout, botCommands, Match, TICK_HZ, type MatchConfig } from "@ftl/sim";

const args = process.argv.slice(2);
const get = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const db = args.includes("--placeholder") ? placeholderDb() : loadDb(resolve("assets-local"));
const a = get("--ship", db.hangar[0]);
const b = get("--ship2", a);
const config: MatchConfig = {
  winCondition: get("--win", "hull") as "hull" | "crew", scrap: 0, shipPool: [], timeLimit: Number(get("--limit", "600")),
  seed: Number(get("--seed", "1")),
};
const m = new Match(db, config, [baseLoadout(db, a), baseLoadout(db, b)], ["bot-a", "bot-b"]);
const trace: string[] = [];
const t0 = performance.now();
while (!m.over) {
  for (const p of [0, 1] as const) for (const c of botCommands(m, p)) m.push(p, c);
  m.step();
  if (args.includes("--trace") && m.state.tick % TICK_HZ === 0) {
    trace.push(JSON.stringify({ t: m.state.tick / TICK_HZ, hull: m.state.ships.map((s) => s.hull), shields: m.state.ships.map((s) => s.shieldLayers), ev: m.state.ships.map((s) => s.evasion) }));
  }
}
const ms = performance.now() - t0;
const st = m.state;
console.log(`db=${db.source} ${a} vs ${b} win=${config.winCondition} seed=${config.seed}`);
console.log(`winner=${st.winner} reason="${st.endReason}" after ${(st.tick / TICK_HZ).toFixed(1)} s (${st.tick} ticks, ${ms.toFixed(0)} ms)`);
for (const s of st.ships) {
  console.log(
    `  ship${s.idx} hull ${s.hull}/${s.maxHull} crew ${s.crew.filter((c) => !c.dead).length}/${s.crew.length} missiles ${s.missiles}`,
    JSON.stringify(s.stats),
  );
}
console.log(`hash=${m.hash()}`);
if (args.includes("--trace")) writeFileSync(get("--trace", "trace.jsonl"), trace.join("\n") + "\n");
