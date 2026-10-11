import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match } from "@ftl/sim";

const db = placeholderDb();
const b = baseLoadout(db, "PH_SKIFF");
const run = (m: Match, s: number) => {
  for (let i = 0; i < Math.round(s * 30); i++) m.step();
};

/** A match where nobody on ship 0 can do anything about what happens to the shields room. */
function quiet() {
  const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
  const [me, them] = m.state.ships;
  const sys = me.systems.shields!;
  const g = m.geo(me);
  me.crew = me.crew.filter((c) => g.tiles.get(c.tile)!.room !== sys.room);
  for (const c of me.crew) c.stun = 1e6;
  for (const c of them.crew) c.stun = 1e6;
  me.shieldLayers = 0;
  return { m, me, them, sys, g };
}

describe("hull damage when a system is taken out", () => {
  it("boarders wrecking a system to nothing cost the hull 1", () => {
    const { m, me, them, sys, g } = quiet();
    const tile = g.roomTiles.get(sys.room)![0];
    const raider = structuredClone(them.crew[0]);
    Object.assign(raider, { id: 900, owner: 1, tile, home: tile, path: [], stun: 0, hp: 1e6, maxHp: 1e6 });
    [raider.x, raider.y] = tile.split(",").map(Number);
    me.crew.push(raider);
    const hull = me.hull;
    for (let i = 0; i < 30 * 120 && sys.damage < sys.level; i++) m.step();
    expect(sys.damage).toBe(sys.level);
    expect(me.hull).toBe(hull - 1);
  });

  it("fire burning a system out costs the hull 1", () => {
    const { m, me, sys, g } = quiet();
    const rs = me.rooms.find((r) => r.id === sys.room)!;
    const hull = me.hull;
    for (let i = 0; i < 30 * 200 && sys.damage < sys.level; i++) {
      // Keep the fire going (and the air in), so only the system burns out.
      for (const t of g.roomTiles.get(sys.room)!) rs.fires[t] = 100;
      rs.o2 = 100;
      m.step();
    }
    expect(sys.damage).toBe(sys.level);
    expect(me.hull).toBe(hull - 1);
  });

  it("a weapon knocking a system out costs only its damage (no extra point)", () => {
    const { m, me, them, sys, g } = quiet();
    const gun = { ...Object.values(db.weapons).find((w) => w.type === "LASER")!, damage: sys.level, hullBust: false, fireChance: 0, breachChance: 0 };
    const hull = me.hull;
    (m as any).hitRoom(them, me, g, gun, sys.room, gun.damage, 0, 0, false);
    expect(sys.damage).toBe(sys.level);
    expect(me.hull).toBe(hull - gun.damage);
  });
});

describe("hull-busting weapons (Hull Lasers, Hull Beams)", () => {
  const setup = () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const [me, them] = m.state.ships;
    const g = m.geo(them);
    const sysRooms = new Set(Object.values(them.systems).map((s) => s!.room));
    const bare = them.rooms.find((r) => !sysRooms.has(r.id))!.id;
    const withSys = them.systems.shields!.room;
    return { m, me, them, g, bare, withSys };
  };
  for (const type of ["LASER", "BEAM"] as const) {
    it(`a hull ${type === "LASER" ? "laser" : "beam"} does double damage to a room without a system, normal damage elsewhere`, () => {
      const { m, me, them, g, bare, withSys } = setup();
      const base = Object.values(db.weapons).find((w) => w.type === type) ?? Object.values(db.weapons)[0];
      const gun = { ...base, type, damage: 1, hullBust: true, fireChance: 0, breachChance: 0, sysDamage: 0 };
      let hull = them.hull;
      (m as any).hitRoom(me, them, g, gun, bare, 1, 0, 0, false);
      expect(them.hull).toBe(hull - 2);
      hull = them.hull;
      (m as any).hitRoom(me, them, g, gun, withSys, 1, 0, 0, false);
      expect(them.hull).toBe(hull - 1);
      // And the same weapon without hull-busting does the plain 1 to the bare room.
      hull = them.hull;
      (m as any).hitRoom(me, them, g, { ...gun, hullBust: false }, bare, 1, 0, 0, false);
      expect(them.hull).toBe(hull - 1);
    });
  }

  it("a hull beam swept across a bare room hits it for double through the beam path", () => {
    const { m, me, them, g, bare } = setup();
    const base = Object.values(db.weapons).find((w) => w.type === "BEAM") ?? Object.values(db.weapons)[0];
    const gun = { ...base, type: "BEAM" as const, damage: 1, hullBust: true, fireChance: 0, breachChance: 0, sysDamage: 0, length: 10, sp: 0 };
    them.shieldLayers = 0;
    them.superShield = 0;
    const t = g.roomTiles.get(bare)![0].split(",").map(Number);
    const cx = (t[0] + 0.5) * 35;
    const cy = (t[1] + 0.5) * 35;
    const hull = them.hull;
    (m as any).resolveBeam(me, them, g, gun, { kind: "beam", x1: cx - 4, y1: cy, x2: cx + 4, y2: cy });
    expect(them.hull).toBe(hull - 2);
  });
});
