import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { placeholderDb } from "@ftl/data";
import { loadDb } from "@ftl/extract";
import { baseLoadout, Bot, botLoadout, DEFAULT_CONFIG, difficultyToBot, Match, priceLoadout } from "@ftl/sim";

const db = placeholderDb();
const L = () => baseLoadout(db, "PH_SKIFF");

describe("races", () => {
  it("rockmen ignore fire; humans burn", () => {
    const lo = { ...L(), crew: [{ name: "Rocky", race: "rock" }, { name: "Hugh", race: "human" }] };
    const m = new Match(db, DEFAULT_CONFIG, [lo, L()], ["a", "b"]);
    const s = m.state.ships[0];
    for (const c of s.crew) s.rooms.find((r) => r.id === m.geo(s).tiles.get(c.tile)!.room)!.fires[c.tile] = 100;
    for (let i = 0; i < 30; i++) m.step();
    const [rock, human] = s.crew;
    expect(rock.maxHp).toBe(150);
    expect(rock.hp).toBe(150);
    expect(human.hp).toBeLessThan(100);
  });
  it("a Zoltan standing in a room powers its system", () => {
    const lo = { ...L(), crew: [{ name: "Z", race: "energy" }] };
    const m = new Match(db, DEFAULT_CONFIG, [lo, L()], ["a", "b"]);
    const s = m.state.ships[0];
    const med = s.systems.medbay!;
    s.systems.medbay!.power = 0;
    m.push(0, { c: "moveCrew", crew: [s.crew[0].id], room: med.room });
    for (let i = 0; i < 30 * 15; i++) m.step();
    expect(med.bonus).toBe(1);
    expect(m.eff(med)).toBe(1);
  });
  it("hiring a race costs its blueprint price; starting crew are free", () => {
    const lo = L();
    expect(priceLoadout(db, lo, 0).ok).toBe(true);
    lo.crew.push({ name: "Mo", race: "mantis" });
    const p = priceLoadout(db, lo, 1000);
    expect(p.total).toBe(db.crew.mantis.cost);
    expect(priceLoadout(db, { ...lo, crew: [{ name: "", race: "human" }] }, 1000).ok).toBe(false);
  });
});

describe("bot", () => {
  it("difficulty maps to skill first, then scrap", () => {
    expect(difficultyToBot(0)).toEqual({ level: 0, scrapBonus: 0 });
    expect(difficultyToBot(60)).toEqual({ level: 1, scrapBonus: 0 });
    expect(difficultyToBot(100)).toEqual({ level: 1, scrapBonus: 1 });
  });
  it("its hangar spend is always a legal loadout", () => {
    for (const lvl of [0, 0.5, 1]) for (const scrap of [0, 150, 400, 900]) expect(priceLoadout(db, botLoadout(db, "PH_SKIFF", scrap, lvl, 3), scrap).ok).toBe(true);
  });
  // Skill only separates bots on real hulls (the tiny placeholder skiff is mostly luck), so this needs the
  // owner's extracted FTL data.
  it.skipIf(!existsSync("assets-local/data/blueprints.xml"))("a skilled bot beats a passive one (Kestrel)", () => {
    const fdb = loadDb("assets-local");
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const lo = botLoadout(fdb, "PLAYER_SHIP_HARD", 300, 1, seed);
      const m = new Match(fdb, { ...DEFAULT_CONFIG, seed, timeLimit: 300 }, [lo, lo], ["a", "b"]);
      const bots = [new Bot(1, seed), new Bot(0, seed + 9)];
      while (!m.over) {
        for (const p of [0, 1] as const) for (const c of bots[p].think(m, p)) m.push(p, c);
        m.step();
      }
      if (m.state.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(8);
  }, 60_000);
});
