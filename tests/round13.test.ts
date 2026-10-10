import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { placeholderDb } from "@ftl/data";
import { loadDb } from "@ftl/extract";
import { baseLoadout, Bot, botLoadout, DEFAULT_CONFIG, enemyLoadout, Match, RULES } from "@ftl/sim";

const real = existsSync("assets-local/data/blueprints.xml");

function run(m: Match, secs: number, each?: () => void): void {
  for (let i = 0; i < secs * 30; i++) {
    each?.();
    m.step();
  }
}

describe("crew fights (FTL's swings)", () => {
  it("a fighter keeps one target and facing for the whole swing, and the damage lands half-way", () => {
    const db = placeholderDb();
    const lo = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [lo, lo], ["a", "b"]);
    const [a, b] = m.state.ships;
    // Put b's first crew member aboard a, on the same tile as a's first.
    const intruder = b.crew[0];
    b.crew = b.crew.filter((c) => c !== intruder);
    const host = a.crew[0];
    Object.assign(intruder, { tile: host.tile, home: host.tile, x: host.x, y: host.y, path: [] });
    a.crew.push(intruder);
    m.step();
    expect(host.task).toBe("fight");
    expect(host.punch).toBe(true);
    expect(host.face).toBe("down");
    expect(intruder.face).toBe("up");
    const foe = host.foe;
    const hp = intruder.hp;
    // Nothing lands in the first third of the swing; the target never changes mid-swing.
    for (let i = 0; i < 10; i++) {
      m.step();
      expect(host.foe).toBe(foe);
    }
    expect(intruder.hp).toBeGreaterThanOrEqual(hp - 0.001);
    run(m, 1);
    expect(intruder.hp).toBeLessThan(hp);
  });
});

describe("bays and clone bay", () => {
  it.skipIf(!real)("a 2x2 medbay takes three crew: its equipment blocks the fourth tile", () => {
    const db = loadDb("assets-local");
    const lo = { ...baseLoadout(db, "PLAYER_SHIP_HARD"), crew: [1, 2, 3, 4].map((i) => ({ name: `C${i}`, race: "human" })) };
    const m = new Match(db, DEFAULT_CONFIG, [lo, baseLoadout(db, "PLAYER_SHIP_HARD")], ["a", "b"]);
    const s = m.state.ships[0];
    const med = s.systems.medbay!;
    expect(m.geo(s).roomTiles.get(med.room)!.length).toBe(4);
    expect(med.blocked).toBeDefined();
    m.push(0, { c: "moveCrew", crew: s.crew.map((c) => c.id), room: med.room });
    run(m, 8);
    const inside = s.crew.filter((c) => m.geo(s).tiles.get(c.tile)?.room === med.room);
    expect(inside.length).toBe(3);
    expect(inside.some((c) => c.tile === med.blocked)).toBe(false);
  });
});

describe("hacked weapons", () => {
  it("a hacking pulse drains the charge building up but keeps a charge weapon's stored charges", () => {
    const db = placeholderDb();
    const lo = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [lo, lo], ["a", "b"]);
    const s = m.state.ships[0];
    const w = s.weapons[0];
    run(m, 1);
    const ws = s.systems.weapons!;
    w.powered = true;
    w.charge = 2;
    w.volleys = 0;
    // Pretend a pulse is running on the weapons room every tick.
    const hackTick = (m as unknown as { hackTick: (x: unknown) => void }).hackTick.bind(m);
    (m as unknown as { hackTick: (x: { idx: number }) => void }).hackTick = (x) => {
      hackTick(x);
      if (x.idx === 0) ws.hacked = true;
    };
    run(m, 1);
    expect(w.charge).toBeLessThan(2);
    expect(w.volleys).toBe(0);
  });
});

describe("bots", () => {
  it.skipIf(!real)("a bot hires no more than five crew, and single-player hulls bring their augments (a Zoltan shield)", () => {
    const db = loadDb("assets-local");
    for (const seed of [1, 2, 3]) expect(botLoadout(db, "PLAYER_SHIP_HARD", 900, 1, seed).crew.length).toBeLessThanOrEqual(5);
    const z = enemyLoadout(db, "ZOLTAN_FIGHTER", 1, 1);
    expect(z.augments).toContain("ENERGY_SHIELD");
    expect(z.crew.length).toBeLessThanOrEqual(6);
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, "PLAYER_SHIP_HARD"), z], ["a", "b"]);
    expect(m.state.ships[1].superShield).toBe(RULES.zoltanShield);
  });

  it.skipIf(!real)("a bot sends one boarding party per fight: once it's dead, no more go", () => {
    const db = loadDb("assets-local");
    const me = baseLoadout(db, "PLAYER_SHIP_HARD");
    const bot = { ...baseLoadout(db, "PLAYER_SHIP_HARD"), systems: { ...baseLoadout(db, "PLAYER_SHIP_HARD").systems, teleporter: 3 }, reactor: 12 };
    const m = new Match(db, { ...DEFAULT_CONFIG, seed: 4 }, [me, bot], ["a", "bot"]);
    const b = new Bot(1, 4);
    const [A, B] = m.state.ships;
    let sent = 0;
    let killed = false;
    for (let t = 0; t < 30 * 90; t++) {
      for (const c of b.think(m, 1)) m.push(1, c);
      m.step();
      for (const e of m.state.events) if (e.e === "teleport" && e.ship === 1 && e.out) sent++;
      // Kill the boarding party as soon as it arrives.
      if (!killed && A.crew.some((c) => c.owner === 1 && !c.beam && !c.dead)) {
        for (const c of A.crew) if (c.owner === 1) c.hp = 0;
        killed = true;
      }
    }
    expect(killed).toBe(true);
    expect(sent).toBe(1);
    expect(B.crew.filter((c) => !c.dead).length).toBeGreaterThan(0);
  }, 60_000);
});

describe("mind control", () => {
  it.skipIf(!real)("a mind-controlled crew member aboard their own ship acts as an intruder: it goes and wrecks a system", () => {
    const db = loadDb("assets-local");
    const lo = baseLoadout(db, "PLAYER_SHIP_HARD");
    // The controller needs a working mind control system, or control lapses at once.
    const ctl = { ...lo, systems: { ...lo.systems, mind: 1 }, reactor: 12 };
    const m = new Match(db, DEFAULT_CONFIG, [ctl, lo], ["a", "b"]);
    const B = m.state.ships[1];
    const g = m.geo(B);
    // Take over b's crew member standing in a room with no system, so they have to walk.
    const c = B.crew[B.crew.length - 1];
    c.mind = { by: 0, t: 30, owner: 1, boost: 0, maxHp: c.maxHp };
    c.owner = 0;
    // Everyone else on b stands still out of the way (no fights on the way).
    for (const q of B.crew) if (q !== c) q.stun = 999;
    run(m, 25);
    const room = g.tiles.get(c.tile)!.room;
    const sys = Object.values(B.systems).find((s) => s && s.room === room);
    expect(sys).toBeDefined();
    expect(["sabotage", "fight", "walk"]).toContain(c.task);
    expect(Object.values(B.systems).some((s) => s && s.damage > 0)).toBe(true);
  });
});
