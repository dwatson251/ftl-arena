import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";
import { baseLoadout, DEFAULT_CONFIG, Match, RULES } from "@ftl/sim";

const db = loadDb(existsSync("assets-local/manifest.json") ? "assets-local" : undefined);
const ship = db.hangar[0];
const run = (m: Match, s: number) => {
  for (let i = 0; i < Math.round(s * 30); i++) m.step();
};

function crystalMatch() {
  const l = baseLoadout(db, ship);
  l.crew = [{ name: "Quartz", race: "crystal" }, ...l.crew.slice(1)];
  const m = new Match(db, DEFAULT_CONFIG, [l, baseLoadout(db, ship)], ["a", "b"]);
  const me = m.state.ships[0];
  const q = me.crew.find((c) => c.race === "crystal")!;
  const g = m.geo(me);
  return { m, me, q, g, room: g.tiles.get(q.tile)!.room };
}

describe("Crystal Lockdown", () => {
  it("seals the crystal's room: nobody leaves, its doors can't be worked, and it wears off after 12 s", () => {
    const { m, me, q, g, room } = crystalMatch();
    m.push(0, { c: "lockdown", crew: q.id });
    m.step();
    expect(me.lockdowns?.some((l) => l.room === room)).toBe(true);
    expect(m.state.events.some((e) => e.e === "lockdown" && e.on)).toBe(true);
    // Ordered out, the crystal stays put.
    const other = [...g.roomTiles.keys()].find((r) => r !== room)!;
    m.push(0, { c: "moveCrew", crew: [q.id], room: other });
    run(m, 3);
    expect(g.tiles.get(q.tile)!.room).toBe(room);
    // Its doors can't be opened by hand.
    const door = g.doors.findIndex((d) => (d.roomA === room || d.roomB === room) && d.roomA >= 0 && d.roomB >= 0);
    if (door >= 0) {
      expect(m.apply(me, { c: "door", door, open: true })).toBe(false);
      expect(m.doorOpen(me, door)).toBe(false);
    }
    run(m, RULES.lockdownTime);
    expect(me.lockdowns?.length ?? 0).toBe(0);
    // Free again, off they go.
    run(m, 4);
    expect(g.tiles.get(q.tile)!.room).not.toBe(room);
  });

  it("recharges for 50 s before it can be used again", () => {
    const { m, me, q } = crystalMatch();
    m.push(0, { c: "lockdown", crew: q.id });
    m.step();
    expect(q.lockCd).toBeGreaterThan(RULES.lockdownRecharge - 1);
    run(m, RULES.lockdownTime + 1);
    expect(m.apply(me, { c: "lockdown", crew: q.id })).toBe(false);
    run(m, RULES.lockdownRecharge);
    expect(m.apply(me, { c: "lockdown", crew: q.id })).toBe(true);
  });

  it("intruders shoot the crystal down", () => {
    const { m, me, room, g } = crystalMatch();
    const door = g.doors.findIndex((d) => (d.roomA === room || d.roomB === room) && d.roomA >= 0 && d.roomB >= 0);
    if (door < 0) return;
    m.lockdown(me, room);
    // An intruder outside the room wants in.
    const d = g.doors[door];
    const outside = d.roomA === room ? d.roomB : d.roomA;
    const tile = g.roomTiles.get(outside)![0];
    const raider = structuredClone(m.state.ships[1].crew[0]);
    Object.assign(raider, { id: 900, owner: 1, tile, home: tile, path: [], hp: 1e6, maxHp: 1e6 });
    [raider.x, raider.y] = tile.split(",").map(Number);
    me.crew.push(raider);
    m.push(1, { c: "moveCrew", crew: [900], room, enemy: true });
    let broken = false;
    for (let i = 0; i < 30 * 11 && !broken; i++) {
      m.step();
      broken = m.state.events.some((e) => e.e === "lockdown" && !e.on && e.broken);
    }
    expect(broken).toBe(true);
  });

  it("the Crystal Lockdown Bomb seals the room it hits", () => {
    const bomb = db.weapons.BOMB_LOCK;
    if (!bomb) return; // (needs the owner's FTL data)
    expect(bomb.lockdown).toBe(true);
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, ship), baseLoadout(db, ship)], ["a", "b"]);
    const T = m.state.ships[1];
    (m as any).hitRoom(m.state.ships[0], T, m.geo(T), bomb, 0, bomb.damage, 0, 0, false);
    expect(T.lockdowns?.some((l) => l.room === 0)).toBe(true);
  });
});
