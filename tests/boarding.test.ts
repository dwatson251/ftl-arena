import { describe, expect, it } from "vitest";
import { placeholderDb, type GameDB } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, geometry, Match, RULES, type Loadout } from "@ftl/sim";

/** The placeholder skiff with a teleporter in room 3 (and drones in room 9). */
function boardingDb(): GameDB {
  const db = placeholderDb();
  const ship = db.ships.PH_SKIFF;
  ship.systems.push({ id: "teleporter", room: 3, power: 1, start: false, station: -1 });
  ship.systems.push({ id: "drones", room: 9, power: 2, start: false, station: -1 });
  ship.droneSlots = 2;
  db.systems.teleporter = { id: "teleporter", maxPower: 3, startPower: 1, upgradeCost: [30, 60], cost: 90 };
  db.systems.drones = { id: "drones", maxPower: 8, startPower: 2, upgradeCost: [30, 40, 50, 60, 70, 80, 90], cost: 60 };
  const d = (id: string, type: "BATTLE" | "BOARDER", power: number) => ({ id, title: id, type, power, cost: 50, cooldown: 1, speed: 10, weapon: "", image: "", icon: "", rarity: 1 });
  db.droneBPs = { BATTLE: d("BATTLE", "BATTLE", 2), BOARDER: d("BOARDER", "BOARDER", 3) };
  return db;
}

const boarder = (db: GameDB, extra: Partial<Loadout> = {}): Loadout => {
  const b = baseLoadout(db, "PH_SKIFF");
  return { ...b, systems: { ...b.systems, teleporter: 3, drones: 3 }, reactor: 20, ...extra };
};

function run(m: Match, secs: number, each?: () => void): void {
  for (let i = 0; i < secs * 30; i++) {
    each?.();
    m.step();
  }
}

/** Walk player 0's first n crew onto the teleporter pad and wait until it's charged. */
function padUp(m: Match, n: number): number[] {
  const s = m.state.ships[0];
  const ids = s.crew.slice(0, n).map((c) => c.id);
  m.push(0, { c: "moveCrew", crew: ids, room: 3 });
  run(m, RULES.teleCooldown[3] + 2);
  return ids;
}

describe("boarding", () => {
  it("teleports crew from the pad to an enemy room, then back", () => {
    const db = boardingDb();
    const m = new Match(db, DEFAULT_CONFIG, [boarder(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const [me, them] = m.state.ships;
    const ids = padUp(m, 2);
    m.push(0, { c: "teleport", room: 5 });
    m.step();
    expect(them.crew.filter((c) => ids.includes(c.id)).length).toBe(2);
    expect(me.tele).toBeLessThan(1);
    // Not charged yet: retrieving fails, then works once charged.
    m.push(0, { c: "retrieve", room: 5 });
    m.step();
    expect(them.crew.filter((c) => ids.includes(c.id)).length).toBe(2);
    run(m, RULES.teleCooldown[3] + 1);
    m.push(0, { c: "retrieve", room: 5 });
    m.step();
    expect(me.crew.filter((c) => ids.includes(c.id)).length).toBe(2);
  });

  it("boarders wreck the system in their room, and defenders fight them", () => {
    const db = boardingDb();
    const m = new Match(db, DEFAULT_CONFIG, [boarder(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const them = m.state.ships[1];
    padUp(m, 1);
    // Oxygen room (5): nobody defends it at first.
    m.push(0, { c: "teleport", room: 5 });
    run(m, 15);
    expect(them.systems.oxygen!.damage).toBeGreaterThan(0);
    // Send the whole enemy crew in: the lone boarder dies, and goes home dead (it was our crew).
    m.push(1, { c: "moveCrew", crew: them.crew.filter((c) => c.owner === 1).map((c) => c.id), room: 5 });
    run(m, 40);
    const mine = m.crewOf(0);
    expect(mine.filter((c) => c.dead).length).toBe(1);
    expect(them.crew.some((c) => c.owner === 0)).toBe(false);
    expect(m.state.winner).toBe(null);
  });

  it("intruders have to break closed doors", () => {
    const db = boardingDb();
    const m = new Match(db, DEFAULT_CONFIG, [boarder(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const them = m.state.ships[1];
    const ids = padUp(m, 1);
    m.push(0, { c: "teleport", room: 5 });
    m.step();
    const g = geometry(db.layouts[them.layout]);
    const doorsOut = g.doors.filter((d) => d.roomA === 5 || d.roomB === 5).map((d) => d.index);
    expect(doorsOut.length).toBeGreaterThan(0);
    for (const i of doorsOut) them.doors[i] = false;
    const target = g.doors.find((d) => doorsOut.includes(d.index) && d.roomA >= 0 && d.roomB >= 0)!;
    const other = target.roomA === 5 ? target.roomB : target.roomA;
    m.push(0, { c: "moveCrew", crew: ids, room: other, enemy: true });
    run(m, 1);
    const c = them.crew.find((q) => q.id === ids[0])!;
    expect(g.tiles.get(c.tile)!.room).toBe(5);
    expect(c.task).toBe("fight");
    let broke = false;
    for (let i = 0; i < 25 * 30 && !broke; i++) {
      m.step();
      broke = m.state.events.some((e) => e.e === "doorBroken");
    }
    expect(broke).toBe(true);
    expect(doorsOut.some((i) => m.doorOpen(them, i))).toBe(true);
  });

  it("a living boarder keeps a player in a crew-kill match", () => {
    const db = boardingDb();
    const m = new Match(db, { ...DEFAULT_CONFIG, winCondition: "crew" }, [boarder(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const [me] = m.state.ships;
    padUp(m, 1);
    m.push(0, { c: "teleport", room: 5 });
    m.step();
    for (const c of me.crew) c.hp = 0;
    run(m, 3);
    expect(m.state.winner).toBe(null);
  });

  it("an anti-personnel drone steps out and fights intruders; a boarding drone lands and breaches", () => {
    const db = boardingDb();
    const a = boarder(db, { drones: ["BOARDER"], droneParts: 3 });
    const b = boarder(db, { drones: ["BATTLE"], droneParts: 3 });
    const m = new Match(db, DEFAULT_CONFIG, [a, b], ["a", "b"]);
    const [me, them] = m.state.ships;
    m.push(0, { c: "dronePower", slot: 0, on: true });
    m.push(1, { c: "dronePower", slot: 0, on: true });
    run(m, 1);
    expect(them.crew.some((c) => c.owner === 1 && c.race === "battle")).toBe(true);
    expect(m.state.projectiles.some((p) => p.kind === "BOARDER")).toBe(true);
    run(m, RULES.boarderFlight + 1);
    expect(them.crew.some((c) => c.owner === 0 && c.race === "boarder")).toBe(true);
    expect(them.rooms.some((r) => Object.keys(r.breaches).length)).toBe(true);
    // Unpowering removes the unit.
    m.push(0, { c: "dronePower", slot: 0, on: false });
    m.step();
    expect(them.crew.some((c) => c.owner === 0)).toBe(false);
    expect(me.droneParts).toBe(2);
  });
});

describe("dead boarders", () => {
  it("go home with a tile on their own ship (the view doesn't choke on them)", async () => {
    const { viewFor } = await import("@ftl/sim");
    const db = boardingDb();
    const m = new Match(db, DEFAULT_CONFIG, [boarder(db), baseLoadout(db, "PH_SKIFF")], ["a", "b"]);
    const [me] = m.state.ships;
    const ids = padUp(m, 1);
    m.push(0, { c: "teleport", room: 5 });
    m.step();
    const c = m.state.ships[1].crew.find((q) => q.id === ids[0])!;
    c.hp = 0;
    run(m, 2);
    expect(me.crew).toContain(c);
    expect(m.geo(me).tiles.has(c.tile)).toBe(true);
    expect(() => viewFor(m, 0)).not.toThrow();
    expect(() => viewFor(m, 1)).not.toThrow();
  });
});
