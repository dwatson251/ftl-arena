import { describe, expect, it } from "vitest";
import { placeholderDb, type GameDB } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match, priceLoadout } from "@ftl/sim";

function dbWithDrones(): GameDB {
  const db = placeholderDb();
  const ship = db.ships.PH_SKIFF;
  ship.droneSlots = 2;
  ship.systems.push({ id: "drones", room: 9, power: 2, start: false, station: -1 });
  db.systems.drones = { id: "drones", maxPower: 8, startPower: 2, upgradeCost: [30, 40, 50, 60, 70, 80, 90], cost: 60 };
  db.weapons.DRONE_LASER = { ...db.weapons.PH_PULSE, id: "DRONE_LASER", shots: 1, rarity: 0 };
  const d = (id: string, type: "COMBAT" | "DEFENSE", power: number, cooldown: number, speed: number, weapon: string) =>
    ({ id, title: id, type, power, cost: 50, cooldown, speed, weapon, image: "", icon: "", rarity: 1 });
  db.droneBPs = { COMBAT_1: d("COMBAT_1", "COMBAT", 2, 1, 15, "DRONE_LASER"), DEFENSE_1: d("DEFENSE_1", "DEFENSE", 2, 1, 5, "DRONE_LASER") };
  db.augments = { DEFENSE_SCRAMBLER: { id: "DEFENSE_SCRAMBLER", title: "Defense Scrambler", desc: "", cost: 80, value: 0, stackable: false, rarity: 4 } };
  return db;
}

const armed = (db: GameDB, drone: string, parts = 3) => {
  const b = baseLoadout(db, "PH_SKIFF");
  return { ...b, systems: { ...b.systems, drones: 2 }, reactor: 12, drones: [drone], droneParts: parts };
};

describe("drones", () => {
  it("are priced like weapons, need the drone system, and parts cost scrap", () => {
    const db = dbWithDrones();
    const l = armed(db, "COMBAT_1", 4);
    const p = priceLoadout(db, l, 9999);
    expect(p.ok).toBe(true);
    expect(p.lines.some((x) => x.item.includes("COMBAT_1"))).toBe(true);
    expect(priceLoadout(db, { ...l, systems: { ...l.systems, drones: 0 } }, 9999).ok).toBe(false);
  });
  it("launching uses a drone part; a combat drone fires at the enemy", () => {
    const db = dbWithDrones();
    const m = new Match(db, DEFAULT_CONFIG, [armed(db, "COMBAT_1"), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const s = m.state.ships[0];
    m.push(0, { c: "dronePower", slot: 0, on: true });
    m.step();
    expect(s.drones![0].deployed).toBe(true);
    expect(s.droneParts).toBe(2);
    const shots = new Set<number>();
    for (let i = 0; i < 30 * 10; i++) {
      m.step();
      for (const p of m.state.projectiles) if (p.drone === 0) shots.add(p.id);
    }
    expect(shots.size).toBeGreaterThan(1);
    // Unpowering loses the drone; powering again uses another part.
    m.push(0, { c: "dronePower", slot: 0, on: false });
    m.step();
    m.push(0, { c: "dronePower", slot: 0, on: true });
    m.step();
    expect(s.droneParts).toBe(1);
  });
  it("a defense drone shoots down incoming missiles (unless scrambled)", () => {
    for (const scramble of [false, true]) {
      const db = dbWithDrones();
      const attacker = { ...baseLoadout(db, "PH_SKIFF"), augments: scramble ? ["DEFENSE_SCRAMBLER"] : [] };
      const m = new Match(db, DEFAULT_CONFIG, [attacker, armed(db, "DEFENSE_1")], ["a", "b"]);
      m.push(1, { c: "dronePower", slot: 0, on: true });
      for (let i = 0; i < 60; i++) m.step();
      m.state.projectiles.push({ id: 500, from: 0, weapon: "PH_TORPEDO", slot: 0, kind: "MISSILES", delay: 0, t: 0, flight: 1.5, target: { kind: "room", room: 3 }, px: 0, py: 0, damageBonus: 0 });
      let intercepted = false;
      for (let i = 0; i < 40; i++) {
        m.step();
        if (m.state.events.some((e) => e.e === "intercept")) intercepted = true;
      }
      expect(intercepted).toBe(!scramble);
    }
  });
});

describe("stations", () => {
  it("a crew member sharing the room takes over a station that was left", () => {
    const db = dbWithDrones();
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, "PH_SKIFF"), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const s = m.state.ships[0];
    const sys = Object.values(s.systems).find((x) => x?.station && ["pilot", "shields", "weapons", "engines"].includes(x.id))!;
    const others = Object.values(s.systems).filter((x) => x && x.room !== sys.room).map((x) => x!.room);
    // Two crew in the system's room: one on the station, one beside it.
    m.push(0, { c: "moveCrew", crew: [s.crew[0].id], room: sys.room });
    m.push(0, { c: "moveCrew", crew: [s.crew[1].id], room: sys.room });
    for (let i = 0; i < 30 * 15; i++) m.step();
    const onStation = () => s.crew.find((c) => c.tile === sys.station && c.path.length === 0);
    const first = onStation()!;
    expect(first).toBeTruthy();
    const other = s.crew.find((c) => c !== first && m.geo(s).tiles.get(c.tile)?.room === sys.room)!;
    expect(other).toBeTruthy();
    m.push(0, { c: "moveCrew", crew: [first.id], room: others[0] });
    for (let i = 0; i < 30 * 6; i++) m.step();
    expect(onStation()?.id).toBe(other.id);
  });
});
