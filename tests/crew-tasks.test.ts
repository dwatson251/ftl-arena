import { describe, expect, it } from "vitest";
import { loadDb } from "@ftl/extract";
import { baseLoadout, Bot, DEFAULT_CONFIG, Match, type Assist, type Command } from "@ftl/sim";

const db = loadDb();
const KESTREL = "PLAYER_SHIP_HARD";
type Move = Extract<Command, { c: "moveCrew" }>;
const moves = (cmds: Command[]) => cmds.filter((c): c is Move => c.c === "moveCrew");
const assist = (): Assist => ({ ownedWeapons: new Set(), ownedSystems: new Set(), claimedCrew: new Set(), stations: new Map(), orders: new Map() });

function setup(level = 1) {
  const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, KESTREL), baseLoadout(db, KESTREL)], ["a", "b"]);
  const bot = new Bot(level, 1, { mistake: 0 });
  const me = m.state.ships[0];
  const think = (a?: Assist) => {
    (bot as any).next = 0;
    return bot.think(m, 0, a);
  };
  return { m, bot, me, think, g: m.geo(me) };
}
const roomOf = (g: ReturnType<Match["geo"]>, tile: string) => g.tiles.get(tile)!.room;
const boarder = (m: Match, room: number, id = 900, race = "human") => {
  const me = m.state.ships[0];
  const c = structuredClone(me.crew[0]);
  const t = m.geo(me).roomTiles.get(room)![0];
  Object.assign(c, { id, owner: 1, tile: t, home: t, path: [], hp: 100, maxHp: 100, race, name: `B${id}` });
  me.crew.push(c);
  return c;
};

describe("crew tasks: a crew member finishes what they started", () => {
  it("a repair under way isn't dropped for a newer one; another crew member takes that", () => {
    const { me, think, bot } = setup();
    me.systems.engines!.damage = 1;
    const first = moves(think()).find((c) => c.room === me.systems.engines!.room)!;
    expect(first).toBeTruthy();
    me.systems.shields!.damage = 1;
    const next = moves(think());
    expect(next.some((c) => c.crew.includes(first.crew[0]) && c.room !== me.systems.engines!.room)).toBe(false);
    const tasks = (bot as any).tasks as Map<number, { kind: string; room: number }>;
    expect([...tasks].some(([id, t]) => id !== first.crew[0] && t.kind === "repair" && t.room === me.systems.shields!.room)).toBe(true);
    expect(tasks.get(first.crew[0])?.room).toBe(me.systems.engines!.room);
  });

  it("a wounded crew member stays in the medbay until fully healed, even with boarders in it", () => {
    const { m, me, think, g } = setup();
    const med = me.systems.medbay!;
    const c = me.crew[0];
    c.hp = c.maxHp * 0.2;
    expect(moves(think()).find((x) => x.crew.includes(c.id))?.room).toBe(med.room);
    // Arrived, healing, back above the threshold: still a patient.
    const t = g.roomTiles.get(med.room)![0];
    Object.assign(c, { tile: t, home: t, path: [], hp: c.maxHp * 0.3 });
    boarder(m, med.room);
    const out = moves(think()).find((x) => x.crew.includes(c.id));
    expect(out === undefined || out.room === med.room).toBe(true);
  });
});

describe("crew tasks: repelling boarders by strength", () => {
  it("one human boarder draws two human defenders (strength x1.2), not the whole crew", () => {
    const { m, me, think, g } = setup();
    const room = [...g.roomTiles.keys()].find((r) => me.crew.every((c) => roomOf(g, c.home) !== r))!;
    boarder(m, room);
    expect(moves(think()).filter((c) => c.room === room).length).toBe(2);
  });

  it("a level-0 bot still sends defenders (crew AI no longer switched off at low levels)", () => {
    const { m, me, think, g } = setup(0);
    const room = [...g.roomTiles.keys()].find((r) => me.crew.every((c) => roomOf(g, c.home) !== r))!;
    boarder(m, room);
    expect(moves(think()).some((c) => c.room === room)).toBe(true);
  });
});

describe("crew tasks: a controller player's own orders", () => {
  it("the AI leaves someone the player moved alone until that room's work is done", () => {
    const { me, think, g } = setup();
    const a = assist();
    const c = me.crew[0];
    me.systems.engines!.damage = 1;
    const room = me.systems.sensors!.room;
    a.orders!.set(c.id, { room });
    expect(moves(think(a)).some((x) => x.crew.includes(c.id))).toBe(false);
    // Arrived and nothing to do there: handed back.
    const t = g.roomTiles.get(room)![0];
    Object.assign(c, { tile: t, home: t, path: [] });
    think(a);
    expect(a.orders!.has(c.id)).toBe(false);
  });
});

describe("power: engine bar for the medbay", () => {
  it("with no spare reactor and someone badly hurt, the assistant moves an engine bar to the medbay", () => {
    const { m, me, think } = setup();
    for (let i = 0; i < 30; i++) m.step();
    // Use up the reactor and switch the medbay off.
    me.systems.medbay!.power = 0;
    me.systems.medbay!.want = 0;
    const used = Object.values(me.systems).reduce((x, s) => x + (s && !["pilot", "sensors", "doors", "battery"].includes(s.id) ? s.power : 0), 0);
    me.reactor = used;
    me.crew[0].hp = me.crew[0].maxHp * 0.3;
    const p = think(assist()).filter((c): c is Extract<Command, { c: "power" }> => c.c === "power");
    expect(p.some((c) => c.system === "engines" && c.delta === -1)).toBe(true);
    expect(p.some((c) => c.system === "medbay" && c.delta === 1)).toBe(true);
  });
});

describe("boarders on the enemy ship", () => {
  it("go for the shields first", () => {
    const { m, think } = setup();
    const them = m.state.ships[1];
    const eg = m.geo(them);
    const mine = m.state.ships[0].crew.shift()!;
    // Aboard their ship, in a room with nothing standing to wreck.
    const empty = [...eg.roomTiles.keys()].find((r) => !Object.values(them.systems).some((s) => s && s.room === r) && them.crew.every((q) => eg.tiles.get(q.tile)?.room !== r))!;
    const t = eg.roomTiles.get(empty)![0];
    Object.assign(mine, { tile: t, home: t, path: [], task: "idle" });
    them.crew.push(mine);
    const out = moves(think()).find((c) => c.crew.includes(mine.id) && c.enemy);
    expect(out?.room).toBe(them.systems.shields!.room);
  });
});

describe("aftermath: the last task", () => {
  it("full-health crew don't go to the medbay; without a saved station they go and man a system", () => {
    const { me, bot, m, g } = setup();
    bot.aftermath = true;
    const a = assist();
    for (const c of me.crew) c.hp = c.maxHp - 0.1;
    (bot as any).next = 0;
    const out = moves(bot.think(m, 0, a));
    expect(out.some((c) => c.room === me.systems.medbay!.room)).toBe(false);
    const stationRooms = new Set(["pilot", "shields", "weapons", "engines"].map((id) => (me.systems as any)[id]?.room));
    for (const c of me.crew) {
      const mv = out.find((x) => x.crew.includes(c.id));
      expect(stationRooms.has(mv ? mv.room : roomOf(g, c.home))).toBe(true);
    }
  });
});
