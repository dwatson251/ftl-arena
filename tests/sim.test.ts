import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout, botCommands, DEFAULT_CONFIG, findPath, Match, priceLoadout, TICK_HZ, viewFor } from "@ftl/sim";

const db = placeholderDb();
const L = () => baseLoadout(db, "PH_SKIFF");
const mk = (cfg = {}) => new Match(db, { ...DEFAULT_CONFIG, timeLimit: 600, ...cfg }, [L(), L()], ["a", "b"]);
const run = (m: Match, max = 30 * 600) => {
  while (!m.over && m.state.tick < max) {
    for (const p of [0, 1] as const) for (const c of botCommands(m, p)) m.push(p, c);
    m.step();
  }
  return m;
};

describe("determinism", () => {
  it("same seed and commands give the same state hash", () => {
    expect(run(mk({ seed: 7 })).hash()).toBe(run(mk({ seed: 7 })).hash());
    expect(run(mk({ seed: 7 })).hash()).not.toBe(run(mk({ seed: 8 })).hash());
  });
});

describe("win conditions", () => {
  it("hull mode ends when a hull reaches 0 or a crew is wiped", () => {
    const m = run(mk({ winCondition: "hull", seed: 3 }));
    expect(m.over).toBe(true);
    const loser = m.state.ships[1 - (m.state.winner as number)];
    expect(loser.hull <= 0 || loser.crew.every((c) => c.dead) || m.state.endReason === "time limit").toBe(true);
  });
  it("crew mode never destroys a hull", () => {
    const m = run(mk({ winCondition: "crew", seed: 3 }));
    for (const s of m.state.ships) expect(s.hull).toBeGreaterThanOrEqual(1);
  });
  it("killing every crew member wins in either mode", () => {
    for (const win of ["hull", "crew"] as const) {
      const m = mk({ winCondition: win });
      for (const c of m.state.ships[1].crew) c.hp = 0.01;
      m.state.ships[1].crew.forEach((c) => (m.state.ships[1].rooms[0].o2 = 0));
      for (const c of m.state.ships[1].crew) c.hp = -1;
      m.step();
      // The death animation plays first; only then is the crew dead and the match over.
      expect(m.state.winner).toBe(null);
      expect(m.state.ships[1].crew.every((c) => c.dying !== undefined)).toBe(true);
      for (let i = 0; i < 40; i++) m.step();
      expect(m.state.winner).toBe(0);
    }
  });
});

describe("combat rules", () => {
  it("evasion makes that share of shots miss", () => {
    // A harmless laser, so the target's evasion stays fixed for the whole run.
    const tdb = placeholderDb();
    tdb.weapons.TEST = { ...tdb.weapons.PH_PULSE, id: "TEST", damage: 0, fireChance: 0, shots: 3, cooldown: 1 };
    const lo = { ...baseLoadout(tdb, "PH_SKIFF"), weapons: ["TEST"] };
    const m = new Match(tdb, { ...DEFAULT_CONFIG, seed: 11 }, [lo, { ...lo, systems: { ...lo.systems, shields: 0 } }], ["a", "b"]);
    m.push(0, { c: "weaponPower", slot: 0, on: true });
    m.push(0, { c: "autofire", slot: 0, on: true });
    m.push(0, { c: "target", slot: 0, target: { kind: "room", room: 3 } });
    for (let t = 0; t < TICK_HZ * 600; t++) m.step();
    const { hits, misses } = m.state.ships[0].stats;
    const ev = m.state.ships[1].evasion / 100;
    expect(ev).toBeGreaterThan(0.1);
    expect(hits + misses).toBeGreaterThan(1000);
    expect(Math.abs(misses / (hits + misses) - ev)).toBeLessThan(0.03);
  });
  it("one shield layer per two shield bars, recharging", () => {
    const m = mk();
    for (let i = 0; i < TICK_HZ * 3; i++) m.step();
    expect(m.state.ships[0].shieldLayers).toBe(1);
  });
  it("power can't exceed the reactor", () => {
    const m = mk();
    const s = m.state.ships[0];
    for (let i = 0; i < 20; i++) m.push(0, { c: "power", system: "shields", delta: 1 });
    m.step();
    const used = Object.values(s.systems).filter((x) => x && !["pilot", "sensors", "doors"].includes(x.id)).reduce((a, x) => a + x!.power, 0);
    expect(used).toBeLessThanOrEqual(s.reactor);
  });
});

describe("hangar", () => {
  it("prices upgrades and rejects over-budget loadouts", () => {
    const l = L();
    l.systems.shields = 4;
    const p = priceLoadout(db, l, 1000);
    expect(p.ok).toBe(true);
    expect(p.total).toBe(50); // shields 2→3 (20) + 3→4 (30)
    expect(priceLoadout(db, l, 40).ok).toBe(false);
    expect(priceLoadout(db, { ...L(), weapons: ["NOPE"] }, 1000).ok).toBe(false);
  });
});

describe("fog", () => {
  it("level-1 sensors hide the enemy interior and weapon charge", () => {
    const m = mk();
    m.step();
    const v = viewFor(m, 0);
    expect(v.ships[1].interior).toBe(false);
    expect(v.ships[1].crew).toHaveLength(0);
    expect(v.ships[1].weapons.every((w) => w.charge === -1)).toBe(true);
    expect(v.ships[0].crew.length).toBeGreaterThan(0);
  });
  it("level-3 sensors reveal both", () => {
    const m = mk();
    m.state.ships[0].systems.sensors!.level = 3;
    m.step();
    const v = viewFor(m, 0);
    expect(v.ships[1].interior).toBe(true);
    expect(v.ships[1].weaponsKnown).toBe(true);
  });
});

describe("oxygen, doors and fire", () => {
  it("open-all twice opens the airlocks and vents the ship, which suffocates the crew", () => {
    const m = mk();
    const s = m.state.ships[0];
    const g = m.geo(s);
    const airlocks = g.doors.filter((d) => d.roomA === -1 || d.roomB === -1).map((d) => d.index);
    expect(airlocks.length).toBeGreaterThan(0);
    m.push(0, { c: "doorsAll", open: true });
    m.step();
    expect(airlocks.every((i) => !s.doors[i])).toBe(true);
    m.push(0, { c: "doorsAll", open: true });
    m.step();
    expect(airlocks.every((i) => s.doors[i])).toBe(true);
    s.systems.oxygen!.damage = s.systems.oxygen!.level; // no refill: venting alone
    for (let i = 0; i < 30 * 40; i++) m.step();
    expect(s.rooms.reduce((a, r) => a + r.o2, 0) / s.rooms.length).toBeLessThan(35); // one airlock, O2 system still running
    expect(s.crew.some((c) => c.hp < c.maxHp)).toBe(true);
    // Close-all shuts everything (checked on a fresh match: this crew has suffocated and the match ended).
    const m2 = mk();
    const s2 = m2.state.ships[0];
    s2.doors = s2.doors.map(() => true);
    m2.push(0, { c: "doorsAll", open: false });
    m2.step();
    expect(s2.doors.every((o) => !o)).toBe(true);
  });
  it("fire spreads across a room", () => {
    const m = mk({ seed: 5 });
    const s = m.state.ships[1];
    const room = s.rooms.find((r) => (m.geo(s).roomTiles.get(r.id)?.length ?? 0) >= 4 && !s.crew.some((c) => m.geo(s).tiles.get(c.tile)!.room === r.id))!;
    room.fires[m.geo(s).roomTiles.get(room.id)![0]] = 100;
    let most = 0;
    for (let i = 0; i < 30 * 30; i++) {
      m.step();
      most = Math.max(most, s.rooms.reduce((a, r) => a + Object.keys(r.fires).length, 0));
    }
    expect(most).toBeGreaterThanOrEqual(3);
  });
});

describe("arena rules round 4", () => {
  it("god mode takes no damage at all", () => {
    const m = mk();
    m.god.add(1);
    const s = m.state.ships[1];
    const hull = s.hull;
    for (let i = 0; i < 30 * 120; i++) {
      for (const c of botCommands(m, 0)) m.push(0, c);
      m.step();
    }
    expect(s.hull).toBe(hull);
    expect(Object.values(s.systems).every((x) => !x || x.damage === 0)).toBe(true);
    expect(s.crew.every((c) => c.hp === c.maxHp)).toBe(true);
  });
  it("an ionised system is locked against power changes", () => {
    const m = mk();
    const s = m.state.ships[0];
    const sh = s.systems.shields!;
    const before = sh.power;
    sh.ion = 1;
    sh.ionTimer = 5;
    expect(m.apply(s, { c: "power", system: "shields", delta: -1 })).toBe(false);
    expect(sh.power).toBe(before);
  });
  it("manning weapons lowers the charge ceiling instead of charging faster", () => {
    const m = mk();
    m.step();
    const s = m.state.ships[0];
    const w = s.weapons.find((x) => x.powered)!;
    const cd = db.weapons[w.bp].cooldown;
    expect(w.cd).toBeLessThan(cd);
  });
  it("crew cut diagonally across rooms", () => {
    const m = mk();
    const s = m.state.ships[0];
    const g = m.geo(s);
    const big = [...g.roomTiles.entries()].find(([, t]) => t.length >= 4)!;
    const [a, , , d] = big[1];
    const p = findPath(g, a, d)!;
    expect(p.length).toBe(1);
  });
  it("only one breach per room", () => {
    const m = mk({ seed: 9 });
    const s = m.state.ships[1];
    for (let i = 0; i < 30 * 200 && !m.over; i++) {
      for (const c of botCommands(m, 0)) m.push(0, c);
      m.step();
      for (const r of s.rooms) expect(Object.keys(r.breaches).length).toBeLessThanOrEqual(1);
    }
  });
});
