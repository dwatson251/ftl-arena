import { describe, expect, it } from "vitest";
import { placeholderDb, type GameDB } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match, reactorUsed, RULES, type Loadout } from "@ftl/sim";

/** The placeholder skiff with a battery (room 3), mind control (room 9) and artillery (room 3, sharing). */
function db3(): GameDB {
  const db = placeholderDb();
  const ship = db.ships.PH_SKIFF;
  ship.systems.push({ id: "battery", room: 3, power: 1, start: false, station: -1 });
  ship.systems.push({ id: "mind", room: 9, power: 1, start: false, station: -1 });
  db.systems.battery = { id: "battery", maxPower: 2, startPower: 1, upgradeCost: [50], cost: 35 };
  db.systems.mind = { id: "mind", maxPower: 3, startPower: 1, upgradeCost: [30, 60], cost: 75 };
  return db;
}
const run = (m: Match, secs: number) => {
  for (let i = 0; i < secs * 30; i++) m.step();
};

describe("battery", () => {
  it("adds reactor bars for a while, then takes them back", () => {
    const db = db3();
    const b = baseLoadout(db, "PH_SKIFF");
    const l: Loadout = { ...b, systems: { ...b.systems, battery: 2, mind: 0 }, reactor: b.reactor };
    const m = new Match(db, DEFAULT_CONFIG, [l, baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const me = m.state.ships[0];
    run(m, 0.2);
    expect(m.apply(me, { c: "battery" })).toBe(true);
    m.step();
    expect(m.cap(me)).toBe(me.reactor + RULES.batteryPower[2]);
    // Spend the bonus bars, then let the battery run out: power comes back off.
    for (let i = 0; i < 4; i++) m.apply(me, { c: "power", system: "engines", delta: 1 });
    m.apply(me, { c: "power", system: "medbay", delta: 1 });
    m.apply(me, { c: "power", system: "oxygen", delta: 1 });
    run(m, RULES.batteryDuration + 1);
    expect(reactorUsed(me)).toBeLessThanOrEqual(me.reactor);
    expect(m.apply(me, { c: "battery" })).toBe(false); // locked
  });
});

describe("mind control", () => {
  it("turns an enemy crew member for a while, then releases them", () => {
    const db = db3();
    const b = baseLoadout(db, "PH_SKIFF");
    const l: Loadout = { ...b, systems: { ...b.systems, mind: 3 }, reactor: 20 };
    const m = new Match(db, DEFAULT_CONFIG, [l, baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const [me, them] = m.state.ships;
    run(m, 0.5);
    const victim = them.crew[0];
    const room = m.geo(them).tiles.get(victim.tile)!.room;
    expect(m.apply(me, { c: "mind", room, enemy: true })).toBe(true);
    const c = them.crew.find((q) => q.mind)!;
    expect(c.owner).toBe(0);
    expect(c.maxHp).toBeGreaterThan(100);
    // Still counts as the enemy's crew for the win condition.
    expect(m.crewOf(1)).toContain(c);
    run(m, RULES.mindDuration[3] + 0.5);
    expect(c.mind).toBeUndefined();
    expect(c.owner).toBe(1);
  });
});

describe("artillery and the shield drone", () => {
  it("artillery fires its weapon by itself when charged", () => {
    const db = placeholderDb();
    db.ships.PH_SKIFF.systems.push({ id: "artillery", room: 3, power: 1, start: true, station: -1, weapon: "PH_PULSE" });
    db.systems.artillery = { id: "artillery", maxPower: 4, startPower: 1, upgradeCost: [30, 50, 80], cost: 150 };
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, "PH_SKIFF"), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    m.state.ships[0].reactor = 20;
    m.apply(m.state.ships[0], { c: "power", system: "artillery", delta: 1 });
    let fired = false;
    for (let i = 0; i < 30 * (db.weapons.PH_PULSE.cooldown + 2) && !fired; i++) {
      m.step();
      fired = m.state.events.some((e) => e.e === "fire" && e.ship === 0 && e.slot <= -2);
    }
    expect(fired).toBe(true);
  });
  it("the Shield Overcharger builds a super shield", () => {
    const db = placeholderDb();
    const ship = db.ships.PH_SKIFF;
    ship.droneSlots = 1;
    ship.systems.push({ id: "drones", room: 9, power: 3, start: true, station: -1 });
    db.systems.drones = { id: "drones", maxPower: 8, startPower: 2, upgradeCost: [30, 40, 50, 60, 70, 80, 90], cost: 60 };
    db.droneBPs = { DRONE_SHIELD: { id: "DRONE_SHIELD", title: "Shield Overcharger", type: "SHIELD", power: 3, cost: 60, cooldown: 2, speed: 5, weapon: "", image: "", icon: "", rarity: 1 } };
    const b = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [{ ...b, drones: ["DRONE_SHIELD"], droneParts: 2, reactor: 20 }, b], ["a", "b"]);
    const me = m.state.ships[0];
    m.apply(me, { c: "dronePower", slot: 0, on: true });
    run(m, 8);
    expect(me.superShield).toBeGreaterThanOrEqual(2);
  });
});
