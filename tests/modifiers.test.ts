import { describe, expect, it } from "vitest";
import { loadDb } from "@ftl/extract";
import { applyMods, baseLoadout, cleanMods, DEFAULT_CONFIG, Match, modBlocked, priceLoadout, stockLoadout } from "@ftl/sim";
import { Lobby, sanitizeConfig, type Client } from "../apps/server/src/lobby.ts";

const db = loadDb();
const KESTREL = "PLAYER_SHIP_HARD";

describe("rule modifiers: what switches what off", () => {
  it("Bare disables the 'No ...' ones; Survival disables all; Bring your own ship disables Bare; autonomous ships disable Crew combat only", () => {
    expect(cleanMods(DEFAULT_CONFIG, ["bare", "noDrones", "noMissiles"])).toEqual(["bare"]);
    expect(modBlocked("noDrones", { ...DEFAULT_CONFIG, mods: ["bare"] })).toMatch(/Bare/);
    expect(cleanMods({ ...DEFAULT_CONFIG, survival: true }, ["noDrones"])).toEqual([]);
    expect(cleanMods({ ...DEFAULT_CONFIG, ftlOnly: true }, ["bare", "noAugments"])).toEqual(["noAugments"]);
    expect(cleanMods({ ...DEFAULT_CONFIG, winCondition: "auto" }, ["crewOnly"])).toEqual([]);
    expect(cleanMods(DEFAULT_CONFIG, ["noDrones", "noAugments", "noMissiles", "crewOnly", "nonsense"])).toEqual(["noDrones", "noAugments", "noMissiles", "crewOnly"]);
    // The server keeps only what holds.
    expect(sanitizeConfig(db, { ...DEFAULT_CONFIG, mods: ["bare", "noDrones"] } as never).mods).toEqual(["bare"]);
  });
});

describe("rule modifiers: fits", () => {
  it("No missiles takes missile weapons and missiles out; Bare is the stock fit; the price check agrees", () => {
    const l = baseLoadout(db, KESTREL);
    expect(l.weapons.some((w) => db.weapons[w].missiles > 0)).toBe(true);
    const n = applyMods(db, { ...l, missiles: 8 }, ["noMissiles"]);
    expect(n.weapons.some((w) => db.weapons[w].missiles > 0)).toBe(false);
    expect(n.missiles).toBe(0);
    expect(priceLoadout(db, { ...l, missiles: 8 }, 9999, [], false, false, { mods: ["noMissiles"] }).ok).toBe(false);
    expect(priceLoadout(db, n, 9999, [], false, false, { mods: ["noMissiles"] }).ok).toBe(true);
    const built = { ...l, systems: { ...l.systems, shields: 4 } };
    expect(applyMods(db, built, ["bare"]).systems.shields).toBe(stockLoadout(db, KESTREL).systems.shields);
  });

  it("the lobby fits everyone's build to the modifiers when they're turned on", () => {
    const c: Client = { id: "P", name: "P", lobby: null, send: () => {} };
    const lb = new Lobby("MODS", "P", db, {}, true);
    lb.join(c);
    lb.setLoadout(c, { ...baseLoadout(db, KESTREL), missiles: 8 });
    lb.setConfig(c, { mods: ["noMissiles"] });
    const mine = lb.players.find((p) => p.id === "P")!.loadout!;
    expect(mine.weapons.some((w) => db.weapons[w].missiles > 0)).toBe(false);
    expect(mine.missiles).toBe(0);
  });
});

describe("Crew combat only", () => {
  const cfg = { ...DEFAULT_CONFIG, mods: ["crewOnly" as const] };
  it("gives every ship a teleporter, and hulls take no damage from hits", () => {
    const m = new Match(db, cfg, [baseLoadout(db, KESTREL), baseLoadout(db, KESTREL)], ["a", "b"]);
    const them = m.state.ships[1];
    expect(m.state.ships[0].systems.teleporter).toBeTruthy();
    const room = them.systems.weapons!.room;
    const before = them.hull;
    (m as any).hitRoom(m.state.ships[0], them, m.geo(them), db.weapons.LASER_BURST_3, room, 3, 0, 0, false);
    expect(them.hull).toBe(before);
    expect(them.systems.weapons!.damage).toBeGreaterThan(0);
  });

  it("losing the whole crew still loses", () => {
    const m = new Match(db, cfg, [baseLoadout(db, KESTREL), baseLoadout(db, KESTREL)], ["a", "b"]);
    for (const c of m.state.ships[1].crew) c.dead = true;
    m.state.ships[1].systems.clonebay && (m.state.ships[1].systems.clonebay.damage = m.state.ships[1].systems.clonebay.level);
    m.step();
    expect(m.state.winner).toBe(0);
  });
});
