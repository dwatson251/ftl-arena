import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";
import {
  applyCard, baseLoadout, buildShip, carryOver, drawCards, installable, isBoss, Match, newRun, nextEnemy, parseUpgraded, registerWeapons, score,
  suppliesCard, SURVIVAL, tierOf, upgradedId, upgradedWeapon, DEFAULT_CONFIG, type Card,
} from "@ftl/sim";
import { Lobby, sanitizeConfig, type Client } from "../apps/server/src/lobby.ts";

const real = existsSync("assets-local/manifest.json");
const db = loadDb(real ? "assets-local" : undefined);
const ship = db.hangar[0];

describe("survival: rewards", () => {
  it("tiers come from FTL's price and rarity", () => {
    expect(tierOf(20, 1)).toBe(1);
    expect(tierOf(45, 2)).toBe(2);
    expect(tierOf(65, 3)).toBe(3);
    expect(tierOf(95, 4)).toBe(4);
    expect(tierOf(50, 5)).toBe(4);
  });

  it("upgraded guns parse, round-trip and get better", () => {
    const base = Object.values(db.weapons).find((w) => w.type === "LASER" && w.power > 1 && w.cost > 0)!;
    const id = upgradedId(base.id, { d: 1, s: 1, c: 1, p: 1 });
    expect(parseUpgraded(id)).toEqual({ base: base.id, mods: { d: 1, s: 1, c: 1, p: 1 } });
    const up = upgradedWeapon(db, id)!;
    expect(up.damage).toBe(base.damage + 1);
    expect(up.shots).toBe(base.shots + 1);
    expect(up.cooldown).toBeLessThan(base.cooldown);
    expect(up.power).toBe(base.power - 1);
    expect(up.title).toBe(`${base.title}++++`);
    expect(registerWeapons(db, [id])[id]).toBeTruthy();
    expect(db.weapons[id]).toBeTruthy();
  });

  it("draws are repeatable and offer at least three cards, one of them supplies", () => {
    const run = newRun(db, ship);
    const a = drawCards(db, run, 42);
    expect(drawCards(db, run, 42)).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.some((c) => c.kind === "supplies")).toBe(true);
  });

  it("never offers what the ship can't take: full weapon slots, three augments, max levels", () => {
    const run = newRun(db, ship);
    const slots = db.ships[ship].weaponSlots;
    const gun = run.loadout.weapons[0] ?? Object.keys(db.weapons).find((w) => db.weapons[w].cost > 0)!;
    run.loadout.weapons = Array.from({ length: slots }, () => gun);
    const augs = Object.values(db.augments).filter((x) => x.cost > 0 && !x.stackable).slice(0, 3).map((x) => x.id);
    run.loadout.augments = augs;
    for (let seed = 1; seed < 60; seed++) {
      for (const c of drawCards(db, run, seed)) {
        expect(c.kind).not.toBe("weapon");
        expect(c.kind).not.toBe("augment");
        expect(installable(db, run.loadout, c)).toBe(true);
      }
    }
  });

  it("rare gear gets likelier as battles get harder, and a boss win always offers it", () => {
    const rares = (battle: number) => {
      let n = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const run = newRun(db, ship);
        run.battle = battle;
        n += drawCards(db, run, seed).filter((c) => c.tier === 4).length;
      }
      return n;
    };
    expect(rares(12)).toBeGreaterThan(rares(1));
    const run = newRun(db, ship);
    run.battle = 10;
    expect(drawCards(db, run, 3).some((c) => c.tier === 4)).toBe(true);
    expect(drawCards(db, run, 3).length).toBeGreaterThanOrEqual(5);
  });

  it("the supplies package is worth about as much as the gear beside it", () => {
    const run = newRun(db, ship);
    run.loadout.hullNow = 10;
    for (const value of [40, 60, 90]) {
      const c = suppliesCard(db, run.loadout, value);
      expect(Math.abs(c.value - value) / value).toBeLessThan(0.25);
      expect(c.hull).toBeGreaterThan(0);
    }
    run.loadout.hullNow = undefined; // full hull: no repairs on offer, plating instead of a pile of missiles
    const full = suppliesCard(db, run.loadout, 90);
    expect(full.hull).toBe(0);
    expect(full.missiles).toBeLessThanOrEqual(SURVIVAL.maxMissiles);
    expect(full.maxHull).toBeGreaterThan(0);
    expect(Math.abs(full.value - 90) / 90).toBeLessThan(0.25);
    applyCard(db, run, full);
    expect(run.loadout.hull).toBe(db.ships[ship].health + full.maxHull!);
  });

  it("every hand offers a system or reactor upgrade while the ship has room for one", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const run = newRun(db, ship);
      run.battle = 1 + (seed % 9);
      const hand = drawCards(db, run, seed);
      expect(hand.some((c) => c.kind === "system" || c.kind === "reactor")).toBe(true);
      expect(hand.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("taking a card puts it on the ship", () => {
    const run = newRun(db, ship);
    const before = run.loadout.missiles;
    applyCard(db, run, { kind: "supplies", title: "Supplies", blurb: "", tier: 1, value: 30, missiles: 5 } as Card);
    expect(run.loadout.missiles).toBe(before + 5);
    expect(run.picks).toEqual(["Supplies"]);
  });
});

describe("survival: battles", () => {
  it("every tenth battle is a boss (the flagship's stages), and difficulty climbs", () => {
    expect([9, 10, 11, 20, 30].map(isBoss)).toEqual([false, true, false, true, true]);
    expect(SURVIVAL.difficulty(1)).toBeLessThan(SURVIVAL.difficulty(8));
    if (real) {
      expect(nextEnemy(db, 10, 1).loadout.ship).toBe("BOSS_1");
      expect(nextEnemy(db, 20, 1).loadout.ship).toBe("BOSS_2");
      expect(nextEnemy(db, 40, 1).loadout.ship).toBe("BOSS_1_HARD");
      expect(nextEnemy(db, 3, 1).hazard).toBe("none");
    }
  });

  it("carries hull, crew health, skills and deaths, system damage, missiles and parts into the next fight", () => {
    const run = newRun(db, ship);
    const m = new Match(db, DEFAULT_CONFIG, [run.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    const me = m.state.ships[0];
    me.hull = 12;
    me.missiles = 3;
    me.crew[0].hp = 40;
    me.crew[0].xp.pilot = 15;
    me.crew[1].dead = true;
    me.systems.shields!.damage = 1;
    // Crew stand where they were put: one moved to a free tile in another room.
    const used = new Set(me.crew.map((c) => c.tile));
    const spot = [...m.geo(me).tiles.keys()].find((t) => !used.has(t))!;
    me.crew[0].tile = me.crew[0].home = spot;
    const stayed = me.crew[2]?.tile;
    // Weapons swapped around in battle keep their new order.
    const order = me.weapons.map((w) => w.bp).reverse();
    if (me.weapons.length > 1) me.weapons.reverse().forEach((w, i) => (w.slot = i)); // as swapWeapons leaves them
    carryOver(run, me);
    if (me.weapons.length === 2) expect(run.loadout.weapons).toEqual(order);
    const next = buildShip(db, run.loadout, 0, "me", () => "x");
    expect(next.hull).toBe(12);
    expect(next.missiles).toBe(3);
    expect(next.crew.length).toBe(me.crew.length - 1);
    expect(next.crew[0].hp).toBe(40);
    expect(next.crew[0].xp.pilot).toBe(15);
    expect(next.systems.shields!.damage).toBe(1);
    expect(next.crew[0].tile).toBe(spot);
    if (stayed) expect(next.crew[1].tile).toBe(stayed);
  });

  it("the aftermath runs the winner's ship (crew repair) and nothing else", () => {
    const run = newRun(db, ship);
    const m = new Match(db, DEFAULT_CONFIG, [run.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    m.state.ships[0].systems.shields!.damage = 1;
    m.state.winner = 0;
    for (let i = 0; i < 30 * 20; i++) m.aftermathStep(0);
    expect(m.state.ships[0].systems.shields!.damage).toBe(0);
    expect(m.state.projectiles.length).toBe(0);
  });

  it("enemy boarders still aboard when the enemy goes stretch the aftermath to 60 s", () => {
    const c: Client = { id: "P", name: "P", lobby: null, send: () => {} };
    const l = new Lobby("SURV", "P", db, { survival: true }, true);
    l.join(c);
    l.setReady(c, true);
    (l as any).start();
    const m = l.match!;
    const [me, them] = m.state.ships;
    const raider = structuredClone(them.crew[0]);
    Object.assign(raider, { id: 900, owner: 1, tile: me.crew[0].tile, path: [] });
    me.crew.push(raider);
    them.hull = 0;
    (l as any).stepOnce();
    expect(l.phase).toBe("aftermath");
    expect(l.state().survival!.boarders).toBe(true);
    expect(l.state().survival!.aftermathLeft).toBe(SURVIVAL.aftermathBoarders);
    expect(SURVIVAL.aftermathBoarders).toBe(60);
    // Kill the last of them: the clock drops to the usual 15 s.
    me.crew.find((x) => x.id === 900)!.dead = true;
    l.tick();
    expect(l.state().survival!.boarders).toBe(false);
    expect(l.state().survival!.aftermathLeft).toBeLessThanOrEqual(SURVIVAL.aftermath);
  });

  it("boarders who outlast the aftermath come along into the next battle, fighting for the new enemy", () => {
    const run = newRun(db, ship);
    const m = new Match(db, DEFAULT_CONFIG, [run.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    const [me, them] = m.state.ships;
    const raider = structuredClone(them.crew[0]);
    Object.assign(raider, { id: 900, owner: 1, tile: me.crew[0].tile, path: [], hp: 33 });
    me.crew.push(raider);
    carryOver(run, me);
    expect(run.loadout.boarders?.length).toBe(1);
    expect(run.loadout.crew.length).toBe(me.crew.length - 1);
    const next = new Match(db, DEFAULT_CONFIG, [run.loadout, nextEnemy(db, 2, 2).loadout], ["me", "bot"]);
    const b = next.state.ships[0].crew.filter((c) => c.owner === 1);
    expect(b.length).toBe(1);
    expect(b[0].hp).toBe(33);
    expect(b[0].tile).toBe(me.crew[0].tile);
  });

  it("stranded boarders never go home: the new enemy's teleporter can't pull them back, and its AI doesn't try", () => {
    const run = newRun(db, ship);
    const first = new Match(db, DEFAULT_CONFIG, [run.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    const raider = structuredClone(first.state.ships[1].crew[0]);
    Object.assign(raider, { id: 900, owner: 1, tile: first.state.ships[0].crew[0].tile, path: [], hp: 20 });
    first.state.ships[0].crew.push(raider);
    carryOver(run, first.state.ships[0]);
    // The next enemy has a teleporter, ready to go.
    const tele = db.hangar.find((h) => db.ships[h].systems.some((x) => x.id === "teleporter"))!;
    const foe = { ...baseLoadout(db, tele), systems: { ...baseLoadout(db, tele).systems, teleporter: 1 } };
    const m = new Match(db, DEFAULT_CONFIG, [run.loadout, foe], ["me", "bot"]);
    const b = m.state.ships[0].crew.find((c) => c.owner === 1)!;
    expect(b.stranded).toBe(true);
    m.state.ships[1].tele = 99;
    m.state.ships[1].systems.teleporter!.power = 1;
    m.state.ships[1].reactor += 3;
    const room = m.geo(m.state.ships[0]).tiles.get(b.tile)!.room;
    m.push(1, { c: "retrieve", room });
    for (let i = 0; i < 30 * 3; i++) m.step();
    expect(m.state.ships[0].crew.some((c) => c.id === b.id && !c.dead)).toBe(true);
    expect(m.state.ships[1].crew.some((c) => c.id === b.id)).toBe(false);
  });

  it("only practice lobbies get Survival", () => {
    expect(sanitizeConfig(db, { ...DEFAULT_CONFIG, survival: true }, false).survival).toBe(false);
    expect(sanitizeConfig(db, { ...DEFAULT_CONFIG, survival: true }, true).survival).toBe(true);
  });

  it("a run in a lobby: win → aftermath → cards → pick → the jump → battle 2; a loss ends it with a score", async () => {
    const got: any[] = [];
    const c: Client = { id: "P", name: "P", lobby: null, send: (m) => got.push(m) };
    const l = new Lobby("SURV", "P", db, { survival: true }, true);
    l.join(c);
    l.setReady(c, true);
    (l as any).start();
    expect(l.phase).toBe("battle");
    expect(l.run?.battle).toBe(1);
    const m = l.match!;
    m.state.ships[1].hull = 0;
    m.state.ships[1].hull = 0;
    (l as any).stepOnce();
    expect(l.phase).toBe("aftermath");
    l.debug(c, { op: "skipAftermath" });
    l.tick();
    expect(l.phase).toBe("reward");
    const offer = l.state().survival!.offer!;
    expect(offer.length).toBeGreaterThanOrEqual(3);
    expect(l.pick(c, 0)).toBeNull();
    expect(l.phase).toBe("jump");
    expect(l.run!.battle).toBe(2);
    await new Promise((r) => setTimeout(r, SURVIVAL.jump * 1000 + 100));
    expect(l.phase).toBe("battle");
    expect(l.match).not.toBe(m);
    l.match!.state.ships[0].hull = 0;
    (l as any).stepOnce();
    expect(l.phase).toBe("over");
    expect(l.run!.over).toBe(true);
    expect(score(l.run!)).toBeGreaterThan(0);
  }, 10000);
});
