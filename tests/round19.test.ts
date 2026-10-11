import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout, Bot, DEFAULT_CONFIG, Match, RULES, viewFor, type Command } from "@ftl/sim";

const db = placeholderDb();
const b = baseLoadout(db, "PH_SKIFF");
const run = (m: Match, s: number) => {
  for (let i = 0; i < Math.round(s * 30); i++) m.step();
};

describe("playtest round 19", () => {
  it("a hull breach drains 8 %/s from its room (FTL's ComputeAirLoss), and closed doors keep it there", () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const me = m.state.ships[0];
    me.systems.oxygen!.power = 0;
    me.doors = me.doors.map(() => false);
    for (const r of me.rooms) r.o2 = 60;
    const room = me.rooms[1];
    const tile = m.geo(me).roomTiles.get(room.id)![0];
    room.breaches[tile] = 100;
    const other = me.rooms.find((r) => r !== room)!;
    me.crew.forEach((c) => (c.path = [])); // nobody wanders off to fix it during the second
    for (const c of me.crew) c.hp = 1e9;
    run(m, 1);
    expect(60 - room.o2).toBeGreaterThan(RULES.breachDrain + RULES.o2Drain - 1.5);
    expect(60 - other.o2).toBeLessThan(RULES.o2Drain + 0.5);
  });

  it("boarders' progress on a system is on show while they wreck it", () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const [me, them] = m.state.ships;
    const sys = me.systems.shields!;
    const g = m.geo(me);
    const raider = structuredClone(them.crew[0]);
    const tile = g.roomTiles.get(sys.room)![0];
    Object.assign(raider, { id: 900, owner: 1, tile, home: tile, path: [], x: Number(tile.split(",")[0]), y: Number(tile.split(",")[1]) });
    me.crew = me.crew.filter((c) => g.tiles.get(c.tile)!.room !== sys.room);
    for (const c of me.crew) c.stun = 30; // nobody comes to stop it
    me.crew.push(raider);
    run(m, 1);
    expect(sys.damage).toBe(0);
    expect(sys.sabotage ?? 0).toBeGreaterThan(0);
    // The owner sees it on their bars; the boarders' side only with level-4 sensors (like repair progress).
    expect(viewFor(m, 0).ships[0].systems.shields!.sabotage ?? 0).toBeGreaterThan(0);
    expect(viewFor(m, 1).ships[0].systems.shields!.sabotage ?? 0).toBe(0);
  });

  it("the enemy's ion and engine glow show whatever your sensors", () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const them = m.state.ships[1];
    them.systems.shields!.ion = 2;
    them.systems.shields!.ionTimer = 4;
    const v = viewFor(m, 0).ships[1];
    expect(v.systemsKnown).toBe(false);
    expect(v.systems.shields!.ion).toBe(2);
    expect(v.systems.shields!.ionTimer).toBe(0);
    expect(v.thrust).toBe(m.eff(them.systems.engines));
    them.systems.engines!.power = 0;
    expect(viewFor(m, 0).ships[1].thrust).toBe(0);
  });

  it("the AI fights boarders first (outnumbering them), then repairs by urgency", () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const [me, them] = m.state.ships;
    const g = m.geo(me);
    // A boarder in the weapons room, and broken shields.
    const wroom = me.systems.weapons!.room;
    const tile = g.roomTiles.get(wroom)!.slice(-1)[0];
    const raider = structuredClone(them.crew[0]);
    Object.assign(raider, { id: 900, owner: 1, tile, home: tile, path: [], x: Number(tile.split(",")[0]), y: Number(tile.split(",")[1]) });
    me.crew.push(raider);
    me.systems.shields!.damage = 1;
    const out: Command[] = [];
    (new Bot(1, 3) as unknown as { crew(m: Match, s: typeof me, o: Command[]): void }).crew(m, me, out);
    const moves = out.filter((c): c is Extract<Command, { c: "moveCrew" }> => c.c === "moveCrew");
    const toFight = moves.filter((c) => c.room === wroom).length;
    const alreadyThere = me.crew.filter((c) => c.owner === 0 && g.tiles.get(c.home)!.room === wroom).length;
    // One boarder: two defenders (counting anyone already in the room).
    expect(toFight + alreadyThere).toBeGreaterThanOrEqual(Math.min(2, me.crew.filter((c) => c.owner === 0).length));
    if (me.crew.filter((c) => c.owner === 0).length > 2) expect(moves.some((c) => c.room === me.systems.shields!.room) || me.crew.some((c) => c.owner === 0 && g.tiles.get(c.home)!.room === me.systems.shields!.room)).toBe(true);
  });
});

describe("boarders' wrecking progress", () => {
  const setup = () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const [me, them] = m.state.ships;
    const sys = me.systems.shields!;
    const g = m.geo(me);
    const tiles = g.roomTiles.get(sys.room)!;
    const raider = structuredClone(them.crew[0]);
    Object.assign(raider, { id: 900, owner: 1, tile: tiles[0], home: tiles[0], path: [], x: Number(tiles[0].split(",")[0]), y: Number(tiles[0].split(",")[1]), hp: 1e6, maxHp: 1e6 });
    me.crew = me.crew.filter((c) => g.tiles.get(c.tile)!.room !== sys.room);
    for (const c of me.crew) c.stun = 1e6; // nobody comes to stop it
    me.crew.push(raider);
    return { m, me, sys, g, tiles, raider };
  };

  it("belongs to the system: a boarder stepping about the room keeps it", () => {
    const { m, sys, tiles, raider } = setup();
    run(m, 1);
    const before = sys.wreck ?? 0;
    expect(before).toBeGreaterThan(0);
    if (tiles.length > 1) m.push(1, { c: "moveCrew", crew: [raider.id], room: sys.room, enemy: true });
    raider.path = tiles.length > 1 ? [tiles[1]] : [];
    run(m, 0.3);
    expect(sys.wreck ?? 0).toBeGreaterThanOrEqual(before);
  });

  it("pauses while a defender fights them in the room, and goes on afterwards", () => {
    const { m, me, sys, tiles } = setup();
    run(m, 1);
    const before = sys.wreck ?? 0;
    // A defender arrives (immortal for the test) and the room is contested.
    const d = me.crew.find((c) => c.owner === 0)!;
    Object.assign(d, { tile: tiles[tiles.length - 1], home: tiles[tiles.length - 1], path: [], stun: 0, hp: 1e6, maxHp: 1e6 });
    [d.x, d.y] = tiles[tiles.length - 1].split(",").map(Number);
    run(m, 1);
    expect(Math.abs((sys.wreck ?? 0) - before)).toBeLessThan(1e-9);
    expect(sys.sabotage ?? 0).toBeGreaterThan(0);
    d.stun = 1e6;
    Object.assign(d, { tile: "nowhere" });
    me.crew = me.crew.filter((c) => c !== d);
    run(m, 0.5);
    expect(sys.wreck ?? 0).toBeGreaterThan(before);
  });

  it("is lost once every boarder has left the room", () => {
    const { m, me, sys, raider } = setup();
    run(m, 1);
    expect(sys.wreck ?? 0).toBeGreaterThan(0);
    me.crew = me.crew.filter((c) => c !== raider);
    run(m, 0.1);
    expect(sys.wreck ?? 0).toBe(0);
    expect(sys.sabotage ?? 0).toBe(0);
  });
});
