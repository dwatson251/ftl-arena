import { describe, expect, it } from "vitest";
import { loadDb } from "@ftl/extract";
import { AFTERMATH, baseLoadout, Bot, DEFAULT_CONFIG, Match, type Assist, type Command } from "@ftl/sim";

const db = loadDb();
const ship = db.hangar[0];
type Move = Extract<Command, { c: "moveCrew" }>;
const movesOf = (cmds: Command[]) => cmds.filter((c): c is Move => c.c === "moveCrew");

/** The aftermath: our ship alone, the controller AI (an assistant) planning for the whole crew. */
function setup() {
  const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, ship), baseLoadout(db, ship)], ["a", "b"]);
  const bot = new Bot(1, 1, { mistake: 0 });
  bot.aftermath = true;
  const a: Assist = { ownedWeapons: new Set(), ownedSystems: new Set(), claimedCrew: new Set(), stations: new Map() };
  const me = m.state.ships[0];
  // Everyone starts standing still in one room (the first crew member's), so every move is a decision.
  return { m, bot, a, me, g: m.geo(me) };
}
const roomOf = (g: ReturnType<Match["geo"]>, tile: string) => g.tiles.get(tile)!.room;

describe("controller AI in Survival's aftermath: the whole crew on one job", () => {
  it("repairs: everyone heads for the same damaged system, the first in the repair order", () => {
    const { m, bot, a, me } = setup();
    const ids = ["shields", "engines"].filter((id) => me.systems[id as "shields"]) as ("shields" | "engines")[];
    expect(ids.length).toBe(2);
    for (const id of ids) me.systems[id]!.damage = 1;
    const first = ids.sort((x, y) => AFTERMATH.repairOrder.indexOf(x) - AFTERMATH.repairOrder.indexOf(y))[0];
    const room = me.systems[first]!.room;
    const crewHere = me.crew.filter((c) => c.owner === 0 && roomOf(m.geo(me), c.home) !== room);
    const cap = m.geo(me).roomTiles.get(room)!.length;
    const mv = movesOf(bot.think(m, 0, a));
    const toRoom = mv.filter((c) => c.room === room).length;
    expect(toRoom).toBe(Math.min(cap, crewHere.length));
  });

  it("boarders: everyone goes for them; the badly hurt go to heal instead", () => {
    const { m, bot, a, me, g } = setup();
    const medRoom = me.systems.medbay?.room;
    const foe = structuredClone(me.crew[0]);
    // A boarder in a room away from the medbay.
    const room = [...g.roomTiles.keys()].find((r) => r !== medRoom && me.crew.every((c) => roomOf(g, c.home) !== r))!;
    Object.assign(foe, { id: 900, owner: 1, tile: g.roomTiles.get(room)![0], home: g.roomTiles.get(room)![0], path: [], hp: 100 });
    me.crew.push(foe);
    const hurt = me.crew[0];
    hurt.hp = hurt.maxHp * 0.2;
    const mv = movesOf(bot.think(m, 0, a));
    const others = me.crew.filter((c) => c.owner === 0 && c.id !== hurt.id);
    for (const c of others) expect(mv.find((x) => x.crew.includes(c.id))?.room).toBe(room);
    if (medRoom !== undefined) expect(mv.find((x) => x.crew.includes(hurt.id))?.room).toBe(medRoom);
    else expect(mv.find((x) => x.crew.includes(hurt.id))?.room).not.toBe(room);
  });

  it("nothing broken: the hurt heal, everyone else goes back to their saved station", () => {
    const { m, bot, a, me, g } = setup();
    const med = me.systems.medbay;
    if (!med) return;
    const [hurt, ...rest] = me.crew.filter((c) => c.owner === 0);
    hurt.hp = hurt.maxHp * 0.6;
    // Stations: a room none of them is in.
    const spot = [...g.roomTiles.keys()].find((r) => r !== med.room && me.crew.every((c) => roomOf(g, c.home) !== r))!;
    for (const c of rest) a.stations!.set(c.id, spot);
    const mv = movesOf(bot.think(m, 0, a));
    expect(mv.find((x) => x.crew.includes(hurt.id))?.room).toBe(med.room);
    for (const c of rest) expect(mv.find((x) => x.crew.includes(c.id))?.room).toBe(spot);
  });

  it("a fire comes before a broken system: everyone puts it out", () => {
    const { m, bot, a, me, g } = setup();
    me.systems.shields!.damage = 1;
    const room = [...g.roomTiles.keys()].find((r) => r !== me.systems.shields!.room && me.crew.every((c) => roomOf(g, c.home) !== r))!;
    me.rooms.find((r) => r.id === room)!.fires[g.roomTiles.get(room)![0]] = 100;
    const cap = g.roomTiles.get(room)!.length;
    const mv = movesOf(bot.think(m, 0, a));
    expect(mv.filter((c) => c.room === room).length).toBe(Math.min(cap, me.crew.filter((c) => c.owner === 0).length));
  });

  it("out of the aftermath, the usual one-job-each plan is unchanged", () => {
    const { m, bot, a, me } = setup();
    bot.aftermath = false;
    me.systems.shields!.damage = 1;
    const mv = movesOf(bot.think(m, 0, a));
    expect(mv.filter((c) => c.room === me.systems.shields!.room).length).toBeLessThanOrEqual(1);
  });
});
