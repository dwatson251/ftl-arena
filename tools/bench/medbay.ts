/** Two boarders teleported into a bot's medbay: how long until the medbay breaks, and do they survive? */
import { resolve } from "node:path";
import { loadDb } from "@ftl/extract";
import { baseLoadout, botCommands, DEFAULT_CONFIG, enemyLoadout, Match, RULES } from "@ftl/sim";

const db = loadDb(resolve("assets-local"));
const me = { ...baseLoadout(db, "PLAYER_SHIP_HARD"), systems: { ...baseLoadout(db, "PLAYER_SHIP_HARD").systems, teleporter: 1 } };
const enemyId = process.argv[2] ?? "REBEL_FAT";
const them = enemyLoadout(db, enemyId, 0.5, 3);
const m = new Match(db, { ...DEFAULT_CONFIG, seed: 3 }, [me, them], ["me", "bot"]);
const [A, B] = m.state.ships;
const med = B.systems.medbay!;
console.log(enemyId, "medbay room", med.room, "level", med.level, "blocked", med.blocked, "crew", B.crew.length, "augs", B.augments);
// Put two of my crew straight into their medbay.
const g = m.geo(B);
const tiles = g.roomTiles.get(med.room)!.filter((t) => t !== med.blocked);
for (const [i, c] of A.crew.slice(0, Math.min(2, tiles.length)).entries()) {
  A.crew = A.crew.filter((q) => q !== c);
  const [x, y] = tiles[i].split(",").map(Number);
  Object.assign(c, { tile: tiles[i], home: tiles[i], x, y, path: [] });
  B.crew.push(c);
}
let broke = -1;
for (let t = 0; t < 30 * 60; t++) {
  for (const cmd of botCommands(m, 1, 0.6)) m.push(1, cmd);
  m.step();
  if (broke < 0 && med.damage >= med.level) broke = t / 30;
  if (t % 60 === 0) {
    const mine = B.crew.filter((c) => c.owner === 0);
    console.log(`${(t / 30).toFixed(0)}s med dmg ${med.damage}/${med.level} boarders ${mine.map((c) => `${c.task}:${c.hp.toFixed(0)}${c.dead ? "†" : ""}`).join(" ")} defenders-in-room ${B.crew.filter((c) => c.owner === 1 && !c.dead && g.tiles.get(c.tile)?.room === med.room).length}`);
  }
}
console.log("medbay broke at", broke, "s; sabotage per bar ≈", (1 / RULES.sabotageRate).toFixed(0), "s");
