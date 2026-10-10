import { describe, expect, it } from "vitest";
import { placeholderDb, type GameDB } from "@ftl/data";
import { baseLoadout, buyableWeapons, DEFAULT_CONFIG, hullSystems, Match, priceLoadout, reactorCap, RULES, viewFor } from "@ftl/sim";

function dbWithAugs(): GameDB {
  const db = placeholderDb();
  const a = (id: string, cost: number, value: number, stackable = false) => ({ id, title: id, desc: "", cost, value, stackable, rarity: 1 });
  db.augments = {
    AUTO_COOLDOWN: a("AUTO_COOLDOWN", 40, 0.1, true), ENERGY_SHIELD: a("ENERGY_SHIELD", 80, 2), ROCK_ARMOR: a("ROCK_ARMOR", 80, 0.15),
    BACKUP_DNA: a("BACKUP_DNA", 40, 0), O2_MASKS: a("O2_MASKS", 50, 0.5),
  };
  return db;
}

describe("augments", () => {
  it("are priced, capped at 3 and non-stackables can't repeat", () => {
    const db = dbWithAugs();
    const l = { ...baseLoadout(db, "PH_SKIFF"), augments: ["AUTO_COOLDOWN", "AUTO_COOLDOWN"] };
    expect(priceLoadout(db, l, 1000).total).toBe(80);
    expect(priceLoadout(db, { ...l, augments: ["ROCK_ARMOR", "ROCK_ARMOR"] }, 1000).ok).toBe(false);
    expect(priceLoadout(db, { ...l, augments: ["AUTO_COOLDOWN", "AUTO_COOLDOWN", "O2_MASKS", "ROCK_ARMOR"] }, 1000).ok).toBe(false);
  });
  it("Automated Re-loader lowers the charge ceiling per copy", () => {
    const db = dbWithAugs();
    const base = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [{ ...base, augments: ["AUTO_COOLDOWN", "AUTO_COOLDOWN"] }, base], ["a", "b"]);
    m.step();
    const w0 = m.state.ships[0].weapons.find((w) => w.powered)!;
    const w1 = m.state.ships[1].weapons.find((w) => w.bp === w0.bp)!;
    expect(w0.cd! / w1.cd!).toBeCloseTo(0.81, 2);
  });
  it("Zoltan Shield absorbs hits before shields and hull", () => {
    const db = dbWithAugs();
    const base = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, { ...DEFAULT_CONFIG, seed: 3 }, [base, { ...base, augments: ["ENERGY_SHIELD"] }], ["a", "b"]);
    const t = m.state.ships[1];
    expect(t.superShield).toBe(5);
    const hull = t.hull;
    m.state.projectiles.push({ id: 999, from: 0, weapon: "PH_TORPEDO", slot: 0, kind: "MISSILES", delay: 0, t: 0, flight: 0.01, target: { kind: "room", room: 3 }, px: 0, py: 0, damageBonus: 0 });
    t.evasion = 0;
    m.state.ships[1].systems.engines!.damage = 2;
    m.step();
    m.step();
    expect(t.superShield).toBeLessThan(5);
    expect(t.hull).toBe(hull);
  });
});

describe("clone bay", () => {
  it("clones a dead crew member back while powered, and loses the queue without power (unless Backup DNA)", () => {
    for (const dna of [false, true]) {
      const db = dbWithAugs();
      const base = baseLoadout(db, "PH_SKIFF");
      const lo = { ...base, systems: { ...base.systems, medbay: 0, clonebay: 1 }, crew: [...base.crew, { name: "Spare", race: "human" }], augments: dna ? ["BACKUP_DNA"] : [] };
      expect(priceLoadout(db, lo, 1000).ok).toBe(true);
      const m = new Match(db, DEFAULT_CONFIG, [lo, base], ["a", "b"]);
      const s = m.state.ships[0];
      const cb = s.systems.clonebay!;
      m.step();
      if (cb.power === 0) cb.power = 1;
      const victim = s.crew[0];
      victim.hp = 0;
      for (let i = 0; i < 40; i++) m.step();
      expect(victim.dead).toBe(true);
      expect(victim.clone).toBeDefined();
      // Cut the power: a moment is survivable, but after 3 s off the last in the queue is lost (FTL).
      cb.damage = cb.level;
      m.step();
      expect(victim.clone).toBeDefined();
      for (let i = 0; i < 30 * RULES.cloneLoss; i++) m.step();
      expect(victim.clone !== undefined).toBe(dna);
      cb.damage = 0;
      cb.power = 1;
      for (let i = 0; i < 30 * 15; i++) m.step();
      expect(victim.dead).toBe(!dna);
      if (dna) expect(victim.hp).toBe(victim.maxHp);
    }
  });
  it("with every crew member dead, the match goes on while the clone bay can bring one back; destroyed, it's over", () => {
    for (const destroy of [false, true]) {
      const db = dbWithAugs();
      const base = baseLoadout(db, "PH_SKIFF");
      const lo = { ...base, systems: { ...base.systems, medbay: 0, clonebay: 1 }, augments: ["BACKUP_DNA"] };
      const m = new Match(db, { ...DEFAULT_CONFIG, winCondition: "crew" }, [lo, base], ["a", "b"]);
      const s = m.state.ships[0];
      const cb = s.systems.clonebay!;
      m.step();
      if (cb.power === 0) cb.power = 1;
      for (const c of s.crew) c.hp = 0;
      for (let i = 0; i < 40; i++) m.step();
      expect(s.crew.every((c) => c.dead)).toBe(true);
      expect(m.state.winner).toBe(null);
      if (destroy) cb.damage = cb.level;
      for (let i = 0; i < 30 * (RULES.cloneTime[1] + 1) && m.state.winner === null; i++) m.step();
      expect(m.state.winner).toBe(destroy ? 1 : null);
      if (!destroy) expect(s.crew.some((c) => !c.dead)).toBe(true);
    }
  });
  it("clones one at a time, in the order they died, and never onto the bay's equipment tile", () => {
    const db = dbWithAugs();
    const base = baseLoadout(db, "PH_SKIFF");
    const lo = { ...base, systems: { ...base.systems, medbay: 0, clonebay: 1 }, crew: [...base.crew, { name: "Spare", race: "human" }] };
    const m = new Match(db, DEFAULT_CONFIG, [lo, base], ["a", "b"]);
    const s = m.state.ships[0];
    const cb = s.systems.clonebay!;
    m.step();
    if (cb.power === 0) cb.power = 1;
    const [first, second] = s.crew;
    first.hp = 0;
    m.step();
    second.hp = 0;
    for (let i = 0; i < 40; i++) m.step();
    expect(first.dead && second.dead).toBe(true);
    // 12 s at level 1: the first is back, the second still waiting.
    for (let i = 0; i < 30 * (RULES.cloneTime[1] + 0.2); i++) m.step();
    expect(first.dead).toBe(false);
    expect(second.dead).toBe(true);
    expect(first.tile).not.toBe(cb.blocked ?? "none");
    for (let i = 0; i < 30 * (RULES.cloneTime[1] + 0.2); i++) m.step();
    expect(second.dead).toBe(false);
  });
});

describe("doors and fog", () => {
  it("manned level-3 doors become super doors (level 4)", () => {
    const db = placeholderDb();
    const base = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [{ ...base, systems: { ...base.systems, doors: 3 } }, base], ["a", "b"]);
    const s = m.state.ships[0];
    const d = s.systems.doors!;
    const c = s.crew[0];
    c.tile = d.station;
    c.path = [];
    m.step();
    expect(m.eff(d)).toBe(4);
  });
  it("hides the enemy's evasion always, but always shows its hull", () => {
    const db = placeholderDb();
    const base = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [base, base], ["a", "b"]);
    m.step();
    const v = viewFor(m, 0);
    expect(v.ships[1].evasion).toBe(-1);
    expect(v.ships[1].hull).toBeGreaterThan(0);
    m.state.ships[0].systems.sensors!.level = 3;
    m.step();
    expect(viewFor(m, 0).ships[1].hull).toBeGreaterThan(0);
  });
  it("unrestricted mode lifts weapons (and drones) to the most their slots could use, and the reactor to match", () => {
    const db = placeholderDb();
    const base = baseLoadout(db, "PH_SKIFF");
    const wmax = hullSystems(db, "PH_SKIFF", true).find((h) => h.id === "weapons")!.max;
    const most = Math.max(...buyableWeapons(db).map((w) => db.weapons[w].power));
    expect(wmax).toBe(Math.max(db.systems.weapons.maxPower, (db.ships.PH_SKIFF.weaponSlots ?? 4) * most));
    expect(priceLoadout(db, { ...base, systems: { ...base.systems, weapons: wmax } }, 99999, [], true).ok).toBe(true);
    expect(priceLoadout(db, { ...base, systems: { ...base.systems, weapons: wmax + 1 } }, 99999, [], true).ok).toBe(false);
    expect(priceLoadout(db, { ...base, systems: { ...base.systems, shields: 12 } }, 99999, [], true).ok).toBe(false);
    const cap = reactorCap(db, "PH_SKIFF", true);
    expect(cap).toBeGreaterThanOrEqual(RULES.reactorMax);
    expect(priceLoadout(db, { ...base, reactor: cap }, 99999, [], true).ok).toBe(true);
    expect(priceLoadout(db, { ...base, reactor: cap + 1 }, 99999, [], true).ok).toBe(false);
  });
});

describe("enemy hull", () => {
  it("is visible with no working sensors at all", () => {
    const db = placeholderDb();
    const base = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [base, base], ["a", "b"]);
    const s = m.state.ships[0].systems.sensors!;
    s.damage = s.level;
    m.step();
    const v = viewFor(m, 0);
    expect(v.ships[1].interior).toBe(false);
    expect(v.ships[1].hull).toBe(m.state.ships[1].hull);
  });
});
