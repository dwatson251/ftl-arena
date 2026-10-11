import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";
import { baseLoadout, Bot, DEFAULT_CONFIG, Match, type Assist, type Command } from "@ftl/sim";
import { Lobby, type Client } from "../apps/server/src/lobby.ts";

const db = loadDb(existsSync("assets-local/manifest.json") ? "assets-local" : undefined);
const ship = db.hangar[0];
const assist = (): Assist => ({ ownedWeapons: new Set(), ownedSystems: new Set(), claimedCrew: new Set() });

/** Run the assistant for a while, collecting everything it sends. */
function run(m: Match, a: Assist, seconds = 20): Command[] {
  const bot = new Bot(1, 7);
  const all: Command[] = [];
  for (let i = 0; i < 30 * seconds; i++) {
    const cmds = bot.think(m, 0, a);
    all.push(...cmds);
    for (const c of cmds) m.push(0, c);
    m.step();
  }
  return all;
}

describe("controller play: the AI assistant", () => {
  it("runs crew and reactor but never aims, boards, hacks or mind-controls", () => {
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, ship), baseLoadout(db, ship)], ["a", "b"]);
    const cmds = run(m, assist());
    expect(cmds.some((c) => c.c === "target" || c.c === "autofire" || c.c === "teleport" || c.c === "hackLaunch" || c.c === "mind")).toBe(false);
    expect(cmds.some((c) => c.c === "moveCrew" || c.c === "power" || c.c === "weaponPower")).toBe(true);
  });

  it("leaves the power of guns and systems the player has taken over alone", () => {
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, ship), baseLoadout(db, ship)], ["a", "b"]);
    const a = assist();
    a.ownedWeapons.add(0);
    a.ownedSystems.add("shields");
    m.push(0, { c: "weaponPower", slot: 0, on: false });
    m.step();
    const cmds = run(m, a);
    expect(cmds.some((c) => c.c === "weaponPower" && c.slot === 0)).toBe(false);
    expect(cmds.some((c) => c.c === "power" && c.system === "shields")).toBe(false);
    expect(m.state.ships[0].weapons[0].powered).toBe(false);
  });

  it("doesn't move crew the player has claimed", () => {
    const m = new Match(db, DEFAULT_CONFIG, [baseLoadout(db, ship), baseLoadout(db, ship)], ["a", "b"]);
    const a = assist();
    const id = m.state.ships[0].crew[0].id;
    a.claimedCrew.add(id);
    m.state.ships[0].systems.shields!.damage = 1; // work to send someone to
    const cmds = run(m, a, 5);
    expect(cmds.some((c) => c.c === "moveCrew" && c.crew.includes(id))).toBe(false);
  });
});

describe("controller play: the lobby", () => {
  it("shows the controller flag, and the teleporter powering down hands claimed crew back", () => {
    const got: any[] = [];
    const c: Client = { id: "P", name: "P", lobby: null, send: (msg) => got.push(msg) };
    const l = new Lobby("PAD", "P", db, {}, true);
    l.join(c);
    l.setController(c, true);
    expect(l.state().players.find((p) => p.id === "P")?.controller).toBe(true);
    l.setReady(c, true);
    (l as any).start();
    l.controlCrew(c, [0, 1], true);
    const as = (l as any).assists.get(0);
    expect([...as.a.claimedCrew]).toEqual([0, 1]);
    l.command(c, { c: "weaponPower", slot: 1, on: false });
    expect(as.a.ownedWeapons.has(1)).toBe(true);
    l.command(c, { c: "power", system: "teleporter", delta: -1 });
    expect(as.a.claimedCrew.size).toBe(0);
    l.setController(c, false);
    expect((l as any).assists.size).toBe(0);
  });
});
