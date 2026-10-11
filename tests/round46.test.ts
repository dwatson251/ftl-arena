import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";
import { baseLoadout, Bot, buildShip, carryOver, DEFAULT_CONFIG, Match, newRun, nextEnemy, RULES, viewFor, type Command } from "@ftl/sim";

const db = loadDb(existsSync("assets-local/manifest.json") ? "assets-local" : undefined);
const ship = db.hangar[0];
const run = (m: Match, s: number) => {
  for (let i = 0; i < Math.round(s * 30); i++) m.step();
};
const mk = () => new Match(db, DEFAULT_CONFIG, [baseLoadout(db, ship), baseLoadout(db, ship)], ["a", "b"]);

describe("playtest round 46", () => {
  it("Lanius don't run from rooms without air (they don't breathe); a human there does", () => {
    const leaves = (race: string) => {
      const m = mk();
      const me = m.state.ships[0];
      const c = me.crew[0];
      c.race = race;
      const room = m.geo(me).tiles.get(c.tile)!.room;
      me.rooms.find((r) => r.id === room)!.o2 = 2;
      return new Bot(1, 1).think(m, 0).some((x: Command) => x.c === "moveCrew" && x.crew.includes(c.id) && x.room !== room);
    };
    expect(leaves("human")).toBe(true);
    expect(leaves("anaerobic")).toBe(false);
  });

  it("boarders with nothing left in their room go looking for crew and systems", () => {
    const m = mk();
    const [me, them] = m.state.ships;
    const g = m.geo(them);
    // A boarder of ours in a room of theirs with no system, nobody around.
    const sysRooms = new Set(Object.values(them.systems).map((s) => s!.room));
    const bare = them.rooms.find((r) => !sysRooms.has(r.id))!.id;
    const tile = g.roomTiles.get(bare)![0];
    const b = structuredClone(me.crew[0]);
    Object.assign(b, { id: 950, owner: 0, tile, home: tile, path: [], hp: 1e6, maxHp: 1e6 });
    [b.x, b.y] = tile.split(",").map(Number);
    them.crew.push(b);
    for (const c of them.crew) if (c.owner === 1) c.stun = 1e6;
    run(m, 3);
    expect(g.tiles.get(b.tile)!.room !== bare || b.path.length > 0).toBe(true);
  });

  it("a system wrecked from inside goes with a systemDown event (the client's explosion)", () => {
    const m = mk();
    const me = m.state.ships[0];
    const sys = me.systems.shields!;
    sys.damage = sys.level;
    (m as any).wrecked(me, sys);
    expect(m.state.events.some((e) => e.e === "systemDown" && e.room === sys.room)).toBe(true);
  });

  it("with sensors down, intruders we can't see are still heard (no positions)", () => {
    const m = mk();
    const [me, them] = m.state.ships;
    me.systems.sensors && (me.systems.sensors.damage = me.systems.sensors.level);
    const g = m.geo(me);
    // An intruder fighting in a room none of our crew are in.
    const ours = new Set(me.crew.map((c) => g.tiles.get(c.tile)!.room));
    const empty = me.rooms.find((r) => !ours.has(r.id))!.id;
    const tile = g.roomTiles.get(empty)![0];
    const raider = structuredClone(them.crew[0]);
    Object.assign(raider, { id: 960, owner: 1, tile, home: tile, path: [], task: "sabotage" });
    me.crew.push(raider);
    const v = viewFor(m, 0).ships[0];
    if (!v.visibleRooms) return; // (no sensors system on this hull)
    expect(v.crew.some((c) => c.id === 960)).toBe(false);
    expect(v.heard?.some((h) => h.id === 960)).toBe(true);
    expect(Object.keys(v.heard![0])).not.toContain("tile");
  });

  it("Survival keeps each room's air and the doors as they were across the jump", () => {
    const r = newRun(db, ship);
    const m = new Match(db, DEFAULT_CONFIG, [r.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    const me = m.state.ships[0];
    me.rooms[0].o2 = 37;
    me.doors[0] = true;
    carryOver(r, me);
    const next = buildShip(db, r.loadout, 0, "me", () => "x");
    expect(next.rooms[0].o2).toBeCloseTo(37);
    expect(next.doors[0]).toBe(true);
  });

  it("a level-1 medbay heals exactly as fast as suffocation hurts", () => {
    expect(RULES.medbayHeal[1]).toBe(RULES.suffocateDps);
  });
});
