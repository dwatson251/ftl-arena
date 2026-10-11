import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";
import { baseLoadout, Bot, DEFAULT_CONFIG, Match, type Command } from "@ftl/sim";

const db = loadDb(existsSync("assets-local/manifest.json") ? "assets-local" : undefined);
const ship = db.hangar[0];
const moves = (cmds: Command[], id: number) => cmds.filter((c): c is Extract<Command, { c: "moveCrew" }> => c.c === "moveCrew" && c.crew.includes(id));

function setup() {
  const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, ship), baseLoadout(db, ship)], ["a", "b"]);
  const bot = new Bot(1, 1);
  return { m, bot, me: m.state.ships[0], them: m.state.ships[1] };
}

describe("crew AI: getting out of trouble", () => {
  it("a badly hurt crew member in a fight leaves the room", () => {
    const { m, bot, me, them } = setup();
    const c = me.crew[0];
    const g = m.geo(me);
    const raider = structuredClone(them.crew[0]);
    Object.assign(raider, { id: 900, owner: 1, tile: c.tile, home: c.tile, path: [] });
    me.crew.push(raider);
    c.hp = c.maxHp * 0.3;
    const here = g.tiles.get(c.tile)!.room;
    const out = moves(bot.think(m, 0), c.id);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].room).not.toBe(here);
  });

  it("anyone in a room with critical air gets out, healthy or not", () => {
    const { m, bot, me } = setup();
    const c = me.crew[0];
    const g = m.geo(me);
    const here = g.tiles.get(c.tile)!.room;
    me.rooms.find((r) => r.id === here)!.o2 = 5;
    const out = moves(bot.think(m, 0), c.id);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].room).not.toBe(here);
  });

  it("while recovering, nobody hurt is sent into a burning room", () => {
    const { m, bot, me } = setup();
    const g = m.geo(me);
    // Every crew member hurt; a fire in the shields room (normally a top task).
    for (const c of me.crew) c.hp = c.maxHp * 0.4;
    const sh = me.systems.shields!.room;
    me.rooms.find((r) => r.id === sh)!.fires[g.roomTiles.get(sh)![0]] = 100;
    const cmds = bot.think(m, 0);
    expect(cmds.some((c) => c.c === "moveCrew" && c.room === sh)).toBe(false);
  });

  it("a hurt boarder in a fight on the enemy ship retreats to a safe room", () => {
    const { m, bot, me, them } = setup();
    const eg = m.geo(them);
    const boarder = structuredClone(me.crew[0]);
    const foe = them.crew[0];
    Object.assign(boarder, { id: 901, owner: 0, tile: foe.tile, home: foe.tile, path: [], hp: 20, stranded: true });
    them.crew.push(boarder);
    const here = eg.tiles.get(foe.tile)!.room;
    const out = bot.think(m, 0).filter((c): c is Extract<Command, { c: "moveCrew" }> => c.c === "moveCrew" && c.crew.includes(901));
    expect(out.length).toBe(1);
    expect(out[0].enemy).toBe(true);
    expect(out[0].room).not.toBe(here);
  });

  // Needs a hull with a drone bay and FTL's boarding drone (not in the placeholder set).
  it.runIf(!!db.drones?.BOARDER && db.ships[ship].systems.some((x) => x.id === "drones"))("the AI doesn't power a boarding drone into a super shield, and stands a waiting one down", () => {
    const withDrone = { ...baseLoadout(db, ship), systems: { ...baseLoadout(db, ship).systems, drones: 3 }, drones: ["BOARDER"], droneParts: 5, reactor: 12 };
    const m = new Match(db, DEFAULT_CONFIG, [withDrone, baseLoadout(db, ship)], ["a", "b"]);
    const bot = new Bot(1, 3);
    m.state.ships[1].superShield = 8;
    const sent: Command[] = [];
    for (let i = 0; i < 30 * 10; i++) {
      m.state.ships[1].superShield = 8;
      const cmds = bot.think(m, 0);
      sent.push(...cmds);
      for (const c of cmds) m.push(0, c);
      m.step();
    }
    expect(sent.some((c) => c.c === "dronePower" && c.on)).toBe(false);
    // The shield drops: now it launches.
    m.state.ships[1].superShield = 0;
    let on = false;
    for (let i = 0; i < 30 * 5 && !on; i++) {
      const cmds = bot.think(m, 0);
      on = cmds.some((c) => c.c === "dronePower" && c.on);
      for (const c of cmds) m.push(0, c);
      m.step();
    }
    expect(on).toBe(true);
  });
});

