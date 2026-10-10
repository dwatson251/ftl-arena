import { describe, expect, it } from "vitest";
import { placeholderDb, type GameDB } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match, RULES, type Loadout } from "@ftl/sim";

/** The placeholder skiff with cloaking (room 3) and hacking (room 9). */
function db2(): GameDB {
  const db = placeholderDb();
  const ship = db.ships.PH_SKIFF;
  ship.systems.push({ id: "cloaking", room: 3, power: 1, start: false, station: -1 });
  ship.systems.push({ id: "hacking", room: 9, power: 1, start: false, station: -1 });
  db.systems.cloaking = { id: "cloaking", maxPower: 3, startPower: 1, upgradeCost: [30, 50], cost: 150 };
  db.systems.hacking = { id: "hacking", maxPower: 3, startPower: 1, upgradeCost: [35, 60], cost: 80 };
  return db;
}
const full = (db: GameDB, extra: Partial<Loadout> = {}): Loadout => {
  const b = baseLoadout(db, "PH_SKIFF");
  return { ...b, systems: { ...b.systems, cloaking: 3, hacking: 3 }, reactor: 25, droneParts: 3, ...extra };
};
const run = (m: Match, secs: number) => {
  for (let i = 0; i < secs * 30; i++) m.step();
};

describe("cloaking", () => {
  it("adds 60 evasion and stops the enemy's weapons charging, then recharges", () => {
    const db = db2();
    const m = new Match(db, DEFAULT_CONFIG, [full(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const [me, them] = m.state.ships;
    run(m, 1);
    const ev = me.evasion;
    expect(m.apply(me, { c: "cloak" })).toBe(true);
    run(m, 0.5);
    expect(me.evasion).toBe(Math.min(100, ev + RULES.cloakEvasion));
    const charge = them.weapons.map((w) => w.charge);
    run(m, 2);
    expect(them.weapons.map((w) => w.charge)).toEqual(charge);
    run(m, RULES.cloakDuration[3]);
    expect(me.cloak!.t).toBe(0);
    expect(m.apply(me, { c: "cloak" })).toBe(false); // recharging
    run(m, RULES.cloakCooldown + 1);
    expect(m.apply(me, { c: "cloak" })).toBe(true);
  });
});

describe("hacking", () => {
  it("the drone uses a part, lands, locks the system's power, and a pulse drops shields", () => {
    const db = db2();
    const m = new Match(db, DEFAULT_CONFIG, [full(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const [me, them] = m.state.ships;
    run(m, 4);
    expect(them.shieldLayers).toBeGreaterThan(0);
    const room = them.systems.shields!.room;
    expect(m.apply(me, { c: "hackLaunch", room })).toBe(true);
    expect(me.droneParts).toBe(2);
    run(m, RULES.hackFlight + 1.5);
    expect(me.hack!.attached).toBe(true);
    expect(m.apply(them, { c: "power", system: "shields", delta: -1 })).toBe(false); // SYSTEM LOCKED
    expect(m.apply(me, { c: "hackPulse" })).toBe(true);
    m.step();
    m.step();
    expect(them.shieldLayers).toBe(0);
    run(m, RULES.hackPulse[3] + 0.5);
    expect(me.hack!.pulse).toBe(0);
    expect(me.hack!.cd).toBeGreaterThan(0);
    run(m, 4);
    expect(them.shieldLayers).toBeGreaterThan(0);
  });
  it("hacked weapons drain and a hacked oxygen system drains the air", () => {
    const db = db2();
    const m = new Match(db, DEFAULT_CONFIG, [full(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const [me, them] = m.state.ships;
    run(m, 5);
    m.apply(me, { c: "hackLaunch", room: them.systems.weapons!.room });
    run(m, RULES.hackFlight + 1.5);
    const before = them.weapons.find((w) => w.powered)!.charge;
    m.apply(me, { c: "hackPulse" });
    run(m, 2);
    expect(them.weapons.find((w) => w.powered)!.charge).toBeLessThan(before);
  });
});

describe("hack-locked doors", () => {
  it("lock the hacked room: its own crew must break out, the hacker's boarders walk through", () => {
    const db = db2();
    const m = new Match(db, DEFAULT_CONFIG, [full(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const [me, them] = m.state.ships;
    const room = them.systems.weapons!.room;
    m.apply(me, { c: "hackLaunch", room });
    run(m, RULES.hackFlight + 1);
    expect(them.lockedRoom).toBe(room);
    const g = m.geo(them);
    const lockedDoors = g.doors.filter((d) => d.roomA === room || d.roomB === room).map((d) => d.index);
    expect(m.apply(them, { c: "door", door: lockedDoors[0], open: true })).toBe(false);
    // Their crew member inside tries to leave: they bash, then the door breaks open for a while.
    const crew = them.crew.find((c) => c.owner === 1 && g.tiles.get(c.tile)!.room === room) ?? them.crew[0];
    const exit = g.doors.find((d) => lockedDoors.includes(d.index) && d.roomA >= 0 && d.roomB >= 0)!;
    if (g.tiles.get(crew.tile)!.room !== room) {
      m.apply(them, { c: "moveCrew", crew: [crew.id], room });
      // Walking in is blocked too: they break in.
    } else m.apply(them, { c: "moveCrew", crew: [crew.id], room: exit.roomA === room ? exit.roomB : exit.roomA });
    let broke = false;
    for (let i = 0; i < 30 * 30 && !broke; i++) {
      m.step();
      broke = m.state.events.some((e) => e.e === "doorBroken" && e.ship === 1);
    }
    expect(broke).toBe(true);
  });
});
