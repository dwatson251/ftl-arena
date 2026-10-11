import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";
import {
  applyCard, baseLoadout, buildShip, carryOver, drawCards, installable, isBoss, isMiniBoss, Match, newRun, nextEnemy, parseUpgraded, registerWeapons, score,
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
    run.battle = 25;
    expect(drawCards(db, run, 3).some((c) => c.tier === 4)).toBe(true);
    expect(drawCards(db, run, 3).length).toBe(3);
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

  it("every hand offers a system or reactor upgrade (unless a +1 choice card took its place)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const run = newRun(db, ship);
      run.battle = 1 + (seed % 9);
      const hand = drawCards(db, run, seed);
      expect(hand.some((c) => c.kind === "system" || c.kind === "reactor" || c.kind === "reinforce" || c.kind === "options")).toBe(true);
      expect(hand.length).toBe(3);
    }
  });

  it("reinforcement: a rare card; each stack gives every bar of that system 10% more health", () => {
    let card: Card | undefined;
    for (let seed = 1; seed < 400 && !card; seed++) card = drawCards(db, newRun(db, ship), seed).find((c) => c.kind === "reinforce");
    expect(card).toBeTruthy();
    expect(card!.tier).toBe(4);
    const run = newRun(db, ship);
    applyCard(db, run, { ...card!, system: "shields" });
    const m = new Match(db, DEFAULT_CONFIG, [run.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    const sh = m.state.ships[0].systems.shields!;
    expect(sh.reinforced).toBe(1);
    sh.level = 12;
    sh.damage = 0;
    // One stack: each bar takes 1.1 points, so eleven 1-point hits break ten bars.
    for (let i = 0; i < 11; i++) (m as any).hurtSystem(sh, 1);
    expect(sh.damage).toBe(10);
    // Stacks add up (two stacks: 1.2 a bar), and an ordinary system takes every point.
    const run2 = newRun(db, ship);
    applyCard(db, run2, { ...card!, system: "shields" });
    applyCard(db, run2, { ...card!, system: "shields" });
    const m2 = new Match(db, DEFAULT_CONFIG, [run2.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    expect(m2.toughness(m2.state.ships[0].systems.shields!)).toBeCloseTo(1.2);
    expect(m2.toughness(m2.state.ships[0].systems.engines!)).toBe(1);
  });

  it("the same system's further stacks get rarer", () => {
    const count = (stacks: number) => {
      let n = 0;
      for (let seed = 1; seed <= 600; seed++) {
        const run = newRun(db, ship);
        run.loadout.reinforced = Object.keys(run.loadout.systems).filter((k) => (run.loadout.systems as any)[k] > 0).flatMap((id) => Array(stacks).fill(id));
        n += drawCards(db, run, seed).filter((c) => c.kind === "reinforce").length;
      }
      return n;
    };
    expect(count(2)).toBeLessThan(count(0));
  });

  it("hands start at 3 cards; +1 choice cards raise it to 5 (the second rare), and no further", () => {
    const run = newRun(db, ship);
    expect(drawCards(db, run, 1).length).toBe(3);
    let plus: Card | undefined;
    for (let seed = 1; seed < 200 && !plus; seed++) plus = drawCards(db, run, seed).find((c) => c.kind === "options");
    expect(plus?.tier).toBe(2);
    applyCard(db, run, plus!);
    expect(drawCards(db, run, 1).length).toBe(4);
    let rare: Card | undefined;
    for (let seed = 1; seed < 2000 && !rare; seed++) rare = drawCards(db, run, seed).find((c) => c.kind === "options");
    expect(rare?.tier).toBe(4);
    applyCard(db, run, rare!);
    expect(drawCards(db, run, 1).length).toBe(5);
    for (let seed = 1; seed < 300; seed++) expect(drawCards(db, run, seed).some((c) => c.kind === "options")).toBe(false);
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
  it("every 25th battle is the flagship (its stages in turn), every other 5th a mini-boss, and difficulty climbs", () => {
    expect([24, 25, 26, 50, 75].map(isBoss)).toEqual([false, true, false, true, true]);
    expect([4, 5, 10, 20, 25, 30].map(isMiniBoss)).toEqual([false, true, true, true, false, true]);
    expect(SURVIVAL.difficulty(1)).toBeLessThan(SURVIVAL.difficulty(8));
    if (real) {
      expect(nextEnemy(db, 25, 1).loadout.ship).toBe("BOSS_1");
      expect(nextEnemy(db, 50, 1).loadout.ship).toBe("BOSS_2");
      expect(nextEnemy(db, 100, 1).loadout.ship).toBe("BOSS_1_HARD");
      // Mini-bosses are player cruisers, kitted out past their stock fit.
      const mini = nextEnemy(db, 5, 3);
      expect(mini.mini).toBe(true);
      expect(db.hangar).toContain(mini.loadout.ship);
      expect(nextEnemy(db, 25, 1).mini).toBe(false);
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
    // (The random enemy may be an automated ship with no crew: then a copy of one of ours plays the raider.)
    const raider = structuredClone(them.crew[0] ?? me.crew[0]);
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

  it("after the win, shots already in the air fly on: the beaten ship's can still land, ours fizzle out", () => {
    const run = newRun(db, ship);
    const m = new Match(db, DEFAULT_CONFIG, [run.loadout, nextEnemy(db, 1, 1).loadout], ["me", "bot"]);
    const me = m.state.ships[0];
    const room = me.systems.engines!.room;
    const base = { slot: 0, kind: "LASER" as const, delay: 0, t: 0, flight: 0.5, px: 0, py: 0, damageBonus: 0 };
    const w = Object.values(db.weapons).find((x) => x.type === "LASER" && x.damage > 0 && !x.id.startsWith("__"))!.id;
    m.state.projectiles.push({ ...base, id: 990, from: 1, weapon: w, target: { kind: "room", room } }, { ...base, id: 991, from: 0, weapon: w, target: { kind: "room", room: 0 } });
    me.shieldLayers = 0;
    m.state.winner = 0;
    const seen: { e: string; ship?: number }[] = [];
    for (let i = 0; i < 30; i++) {
      m.aftermathStep(0);
      seen.push(...(m.state.events as { e: string; ship?: number }[]));
    }
    expect(m.state.projectiles.length).toBe(0);
    // The enemy's shot arrived at us (a hit, or a miss off our evasion); ours never touched the wreck.
    expect(seen.some((e) => (e.e === "hit" || e.e === "miss" || e.e === "shield") && e.ship === 0)).toBe(true);
    expect(seen.some((e) => (e.e === "hit" || e.e === "miss" || e.e === "shield") && e.ship === 1)).toBe(false);
  });

    it("beating a mini-boss (or the flagship) earns a re-roll", () => {
    const c: Client = { id: "P", name: "P", lobby: null, send: () => {} };
    const l = new Lobby("SURV", "P", db, { survival: true }, true);
    l.join(c);
    l.setReady(c, true);
    l.run = newRun(db, ship);
    l.run.battle = 5; // a mini-boss
    (l as any).start();
    expect(l.state().survival!.mini).toBe(true);
    l.match!.state.ships[1].hull = 0;
    (l as any).stepOnce();
    expect(l.state().survival!.rerolls).toBe(3);
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
    expect(offer.length).toBe(3);
    // Re-rolls: two to start; each deals a fresh hand; then none.
    expect(l.state().survival!.rerolls).toBe(2);
    expect(l.reroll(c)).toBeNull();
    expect(l.reroll(c)).toBeNull();
    expect(l.reroll(c)).toMatch(/no re-rolls/);
    expect(l.state().survival!.rerolls).toBe(0);
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
