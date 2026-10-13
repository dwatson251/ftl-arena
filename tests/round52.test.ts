import { describe, expect, it } from "vitest";
import { loadDb } from "@ftl/extract";
import { baseLoadout, carryOver, DEFAULT_CONFIG, Match, newRun, nextEnemy, RULES, viewFor, type Loadout } from "@ftl/sim";
import { Lobby, type Client } from "../apps/server/src/lobby.ts";

const db = loadDb();
const KESTREL = "PLAYER_SHIP_HARD";
/** A Kestrel with the teleporter installed (and the reactor to run it). */
const withTele = (): Loadout => {
  const l = baseLoadout(db, KESTREL);
  return { ...l, systems: { ...l.systems, teleporter: 1 }, reactor: l.reactor + 2 };
};
const run = (m: Match, s: number) => {
  for (let i = 0; i < s * 30; i++) m.step();
};

describe("teleporter", () => {
  it("is ready at the start of a battle (no warm-up), and cools down after use", () => {
    const m = new Match(db, DEFAULT_CONFIG, [withTele(), baseLoadout(db, KESTREL)], ["a", "b"]);
    m.step();
    const me = m.state.ships[0];
    expect(m.teleReady(me)).toBe(true);
    // Put two crew on the pad and send them.
    const g = m.geo(me);
    const pad = g.roomTiles.get(me.systems.teleporter!.room)!;
    me.crew.slice(0, 2).forEach((c, i) => Object.assign(c, { tile: pad[i], home: pad[i], path: [] }));
    const room = [...m.geo(m.state.ships[1]).roomTiles.keys()][0];
    m.push(0, { c: "teleport", room });
    m.step();
    expect(m.teleReady(me)).toBe(false);
    run(m, RULES.teleCooldown[1] + 1);
    expect(m.teleReady(me)).toBe(true);
  });

  it("sends everyone in the pad room, even someone still walking between its tiles", () => {
    const m = new Match(db, DEFAULT_CONFIG, [withTele(), baseLoadout(db, KESTREL)], ["a", "b"]);
    m.step();
    const me = m.state.ships[0];
    const pad = m.geo(me).roomTiles.get(me.systems.teleporter!.room)!;
    const [a, b] = me.crew;
    Object.assign(a, { tile: pad[0], home: pad[0], path: [] });
    // b stands on the pad but is still stepping to its other tile.
    Object.assign(b, { tile: pad[1] ?? pad[0], home: pad[0], path: [pad[0]] });
    const room = [...m.geo(m.state.ships[1]).roomTiles.entries()].find(([, t]) => t.length >= 2)![0];
    m.push(0, { c: "teleport", room });
    m.step();
    expect(!!a.beam && !!b.beam).toBe(true);
  });

  it("a cooldown carries over between Survival battles", () => {
    const r = newRun(db, KESTREL);
    r.loadout = { ...r.loadout, systems: { ...r.loadout.systems, teleporter: 1 }, reactor: r.loadout.reactor + 2 };
    const m = new Match(db, DEFAULT_CONFIG, [r.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    m.step();
    m.state.ships[0].tele = 3;
    carryOver(r, m.state.ships[0]);
    const m2 = new Match(db, DEFAULT_CONFIG, [r.loadout, nextEnemy(db, 2, 1).loadout], ["me", "bot"]);
    expect(m2.state.ships[0].tele).toBe(3);
    expect(m2.teleReady(m2.state.ships[0])).toBe(false);
  });
});

describe("stun", () => {
  it("a weapon with a stun time and no stun chance (Ion Stunner) always stuns the crew in the room", () => {
    expect(db.weapons.ION_STUN.stun).toBeGreaterThan(0);
    expect(db.weapons.ION_STUN.stunChance).toBe(0);
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, KESTREL), baseLoadout(db, KESTREL)], ["a", "b"]);
    const them = m.state.ships[1];
    const c = them.crew[0];
    const room = m.geo(them).tiles.get(c.tile)!.room;
    // Strip their shields so the shot lands.
    them.shieldLayers = 0;
    (m as any).hitRoom(m.state.ships[0], them, m.geo(them), db.weapons.ION_STUN, room, 0, 0, 0, false);
    expect(c.stun).toBeGreaterThanOrEqual(db.weapons.ION_STUN.stun - 0.01);
  });
});

describe("mind control", () => {
  it("an enemy under your control shows you their room", () => {
    const l = baseLoadout(db, KESTREL);
    const m = new Match(db, { ...DEFAULT_CONFIG }, [l, l], ["a", "b"]);
    const them = m.state.ships[1];
    // No sensors: the enemy's interior is hidden.
    them.systems.sensors && (them.systems.sensors.level = 0);
    m.state.ships[0].systems.sensors!.damage = m.state.ships[0].systems.sensors!.level;
    const c = them.crew[0];
    const room = m.geo(them).tiles.get(c.tile)!.room;
    expect(viewFor(m, 0).ships[1].visibleRooms).not.toContain(room);
    c.mind = { by: 0, t: 10, owner: 1, boost: 0, maxHp: c.maxHp };
    c.owner = 0;
    expect(viewFor(m, 0).ships[1].visibleRooms).toContain(room);
  });
});

describe("medbay", () => {
  it("heals crew walking through it, not only those standing still", () => {
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, KESTREL), baseLoadout(db, KESTREL)], ["a", "b"]);
    const me = m.state.ships[0];
    m.step();
    const med = me.systems.medbay!;
    const tiles = m.geo(me).roomTiles.get(med.room)!;
    const c = me.crew[0];
    Object.assign(c, { tile: tiles[0], home: tiles[0], path: [tiles[1] ?? tiles[0]], hp: 40 });
    m.step();
    expect(c.healing).toBe(true);
  });
});

describe("Survival: power carries over", () => {
  it("the power each system was left on, and the guns' on/off state, come back after the jump", () => {
    const r = newRun(db, KESTREL);
    const m = new Match(db, DEFAULT_CONFIG, [r.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    run(m, 1);
    const me = m.state.ships[0];
    // The player turns the shields down to one bar and the first gun off.
    me.systems.shields!.want = 1;
    me.systems.shields!.power = 1;
    me.weapons[0].want = false;
    me.weapons[0].powered = false;
    carryOver(r, me);
    const m2 = new Match(db, DEFAULT_CONFIG, [r.loadout, nextEnemy(db, 2, 1).loadout], ["me", "bot"]);
    run(m2, 1);
    const me2 = m2.state.ships[0];
    expect(me2.systems.shields!.power).toBe(1);
    expect(me2.weapons[0].powered).toBe(false);
  });
});

describe("Survival: losing the crew after the battle", () => {
  it("ends the run, as a defeat would", () => {
    const c: Client = { id: "P", name: "P", lobby: null, send: () => {} };
    const l = new Lobby("SURV", "P", db, { survival: true }, true);
    l.join(c);
    l.setReady(c, true);
    (l as any).start();
    const m = l.match!;
    m.state.ships[1].hull = 0;
    (l as any).stepOnce();
    expect(l.phase).toBe("aftermath");
    for (const x of m.state.ships[0].crew) x.dead = true;
    l.tick();
    expect(l.phase).toBe("over");
  });
});

describe("intruder alert without sensors", () => {
  it("the view counts hostile crew aboard even when sensors are down and they're out of sight", () => {
    const l = baseLoadout(db, KESTREL);
    const m = new Match(db, DEFAULT_CONFIG, [l, l], ["a", "b"]);
    const me = m.state.ships[0];
    me.systems.sensors!.damage = me.systems.sensors!.level;
    const g = m.geo(me);
    const empty = [...g.roomTiles.keys()].find((r) => me.crew.every((c) => g.tiles.get(c.tile)!.room !== r))!;
    const b = structuredClone(me.crew[0]);
    const t = g.roomTiles.get(empty)![0];
    Object.assign(b, { id: 900, owner: 1, tile: t, home: t, path: [] });
    me.crew.push(b);
    const v = viewFor(m, 0).ships[0];
    expect(v.crew.some((c) => c.id === 900)).toBe(false);
    expect(v.intruders).toBe(1);
  });
});
