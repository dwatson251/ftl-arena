/**
 * Survival (single player): one ship, battle after battle. The hull, crew, damage and supplies carry over;
 * after each win the player takes one of a few reward cards (gear, upgrades, supplies). Pure and seeded, so
 * the server runs it and the tests can replay it. All the numbers are first guesses, meant for tuning.
 */
import type { GameDB, SystemId, WeaponBP } from "@ftl/data";
import { baseLoadout, buyableDrones, buyableWeapons, hireableRaces, hullSystems, isSubsystem, priceLoadout, randomCrewName, reactorCap, type Loadout } from "./loadout.ts";
import { botLoadout, difficultyToBot, enemyLoadout } from "./bot.ts";
import { Rng } from "./rng.ts";
import { RULES } from "./rules.ts";
import type { HazardKind, ShipState } from "./state.ts";

export const SURVIVAL = {
  /** Seconds the sim keeps running after a win (repairs, fires, boarders) before the reward cards. */
  aftermath: 15,
  /** …stretched to this while enemy boarders are still aboard when the enemy ship goes (time to fight them off). */
  aftermathBoarders: 60,
  /** Seconds between picking a card and the next battle (the client's jump animation). */
  jump: 3.6,
  /** Difficulty (0-100) of battle n: starts easy, +7 a battle, capped. */
  difficulty: (n: number) => Math.min(95, 5 + 5 * (n - 1)),
  /** Every 25th battle is the Rebel flagship, its stages in turn (Hard layouts from the fourth time). */
  bossEvery: 25,
  /** Every fifth battle otherwise is a mini-boss: a player cruiser, fitted out like a rival captain's. */
  miniEvery: 5,
  /** A mini-boss's hangar budget: this plus 6 scrap per point of difficulty. */
  miniScrap: 250,
  /** From battle 4, a hazard sometimes comes with the beacon (never with a boss). */
  hazardChance: 0.12,
  hazards: ["sun", "pulsar", "asteroids", "nebula", "storm", "asb"] as HazardKind[],
  /** Scrap-equivalent values for supplies packages. */
  hullValue: 3,
  missileValue: 6,
  partValue: 8,
  /** Value of one weapon upgrade, and how many a gun can take. */
  upgradeValue: 25,
  maxUpgrades: 3,
  /** A point of max hull (reinforced plating: what a supplies card turns into once the hull is full). */
  platingValue: 12,
  /** How often the system card is instead a (rare) reinforcement for one installed system. */
  reinforceChance: 0.16,
  /** Reward cards on offer: 3 to start; "+1 choice" cards raise it (the first is common, the second rare). */
  options: { start: 3, max: 5, plusChance: [0.3, 0.07] },
  /** Re-rolls (a fresh hand): 2 to start, one more for each boss or mini-boss beaten. */
  rerolls: 2,
  /** Most missiles one supplies card brings. */
  maxMissiles: 8,
  /** Augments that do something in a fight (FTL's campaign-only ones, like scrap or Rebel-fleet delays, don't). */
  augments: [
    "AUTO_COOLDOWN", "BACKUP_DNA", "BATTERY_BOOSTER", "CLOAK_FIRE", "CREW_STIMS", "CRYSTAL_SHARDS", "DEFENSE_SCRAMBLER", "DRONE_SPEED",
    "ENERGY_SHIELD", "EXPLOSIVE_REPLICATOR", "FIRE_EXTINGUISHERS", "HACKING_STUN", "ION_ARMOR", "LIFE_SCANNER", "NANO_MEDBAY", "O2_MASKS",
    "ROCK_ARMOR", "SHIELD_RECHARGE", "SLUG_GEL", "SYSTEM_CASING", "TELEPORT_HEAL", "WEAPON_PREIGNITE", "ZOLTAN_BYPASS",
  ],
  /** Score: per battle won, per boss, per card, per rare card. */
  score: { win: 100, boss: 500, mini: 250, card: 10, rare: 25 },
};

export interface SurvivalRun {
  /** The battle being fought (or about to be), from 1. */
  battle: number;
  won: number;
  bosses: number;
  /** Mini-bosses beaten (player cruisers). */
  minis?: number;
  /** Reward cards on offer after each win (3-5). */
  options?: number;
  /** Re-rolls left. */
  rerolls?: number;
  /** Titles of the cards taken, in order. */
  picks: string[];
  rare: number;
  /** The ship: its gear plus what carries over (hullNow, crew hp/xp, damage, missiles, parts). */
  loadout: Loadout;
  over: boolean;
}

export type CardKind = "weapon" | "upgrade" | "drone" | "augment" | "system" | "reactor" | "crew" | "supplies" | "reinforce" | "options";

export interface Card {
  kind: CardKind;
  title: string;
  blurb: string;
  /** 1 common … 4 rare (drawn gold). */
  tier: 1 | 2 | 3 | 4;
  /** Rough scrap-equivalent worth (for balancing the hand). */
  value: number;
  /** weapon / drone / augment id; upgrade: the upgraded weapon's id. */
  id?: string;
  /** upgrade: which weapon slot. */
  slot?: number;
  system?: SystemId;
  race?: string;
  name?: string;
  hull?: number;
  missiles?: number;
  parts?: number;
  /** supplies: reinforced plating (max hull, and the hull with it). */
  maxHull?: number;
}

/** The stock ship as FTL starts it, missiles included (the hangar's base loadout leaves missiles to buy). */
export function stockLoadout(db: GameDB, ship: string): Loadout {
  const l = baseLoadout(db, ship);
  l.missiles = db.ships[ship]?.missiles ?? 0;
  return l;
}

export function newRun(db: GameDB, ship: string): SurvivalRun {
  return { battle: 1, won: 0, bosses: 0, picks: [], rare: 0, loadout: stockLoadout(db, ship), over: false, options: SURVIVAL.options.start, rerolls: SURVIVAL.rerolls };
}

export const isBoss = (n: number) => n > 0 && n % SURVIVAL.bossEvery === 0;
export const isMiniBoss = (n: number) => n > 0 && !isBoss(n) && n % SURVIVAL.miniEvery === 0;

/** Tier from FTL's own price and store rarity: rarity 5 or 80+ scrap is rare. */
export function tierOf(cost: number, rarity: number): 1 | 2 | 3 | 4 {
  if (rarity >= 5 || cost >= 80) return 4;
  if (cost <= 35) return 1;
  if (cost <= 55) return 2;
  return 3;
}

// ------------------------------------------------------------------ weapon upgrades

/** A weapon id with upgrades on it: BASE+d1s0c2p0 (damage, shots, charge time, power). */
export interface WeaponMods {
  d: number;
  s: number;
  c: number;
  p: number;
}

export function parseUpgraded(id: string): { base: string; mods: WeaponMods } {
  const [base, tail] = id.split("+");
  const m = /^d(\d+)s(\d+)c(\d+)p(\d+)$/.exec(tail ?? "");
  return { base, mods: m ? { d: +m[1], s: +m[2], c: +m[3], p: +m[4] } : { d: 0, s: 0, c: 0, p: 0 } };
}

export const upgradedId = (base: string, m: WeaponMods) => (m.d + m.s + m.c + m.p ? `${base}+d${m.d}s${m.s}c${m.c}p${m.p}` : base);
const modCount = (m: WeaponMods) => m.d + m.s + m.c + m.p;

/** The blueprint of an upgraded weapon (built from its base; null for an unknown base). */
export function upgradedWeapon(db: GameDB, id: string): WeaponBP | null {
  const { base, mods } = parseUpgraded(id);
  const b = db.weapons[base];
  if (!b) return null;
  if (!modCount(mods)) return b;
  // A "+" for each upgrade on it: Burst Laser II++.
  const plus = "+".repeat(modCount(mods));
  return {
    ...b,
    id,
    title: `${b.title}${plus}`,
    short: b.short ? `${b.short}${plus}` : undefined,
    damage: b.damage + mods.d,
    shots: b.shots + mods.s,
    cooldown: Math.round(b.cooldown * 0.8 ** mods.c * 10) / 10,
    power: Math.max(1, b.power - mods.p),
    cost: b.cost + SURVIVAL.upgradeValue * modCount(mods),
  };
}

/** Make sure every upgraded weapon in `ids` has a blueprint in the db; returns the new ones. */
export function registerWeapons(db: GameDB, ids: string[]): Record<string, WeaponBP> {
  const out: Record<string, WeaponBP> = {};
  for (const id of ids) {
    if (!id.includes("+")) continue;
    const bp = db.weapons[id] ?? upgradedWeapon(db, id);
    if (!bp) continue;
    db.weapons[id] = bp;
    out[id] = bp;
  }
  return out;
}

/** What one more of each upgrade does to a gun (only the ones that make sense for it). */
function upgradeOptions(db: GameDB, id: string): { key: keyof WeaponMods; label: string }[] {
  const bp = upgradedWeapon(db, id);
  if (!bp) return [];
  const out: { key: keyof WeaponMods; label: string }[] = [];
  if (bp.damage > 0 || bp.type === "BEAM") out.push({ key: "d", label: "+1 damage" });
  if (bp.type === "LASER" || bp.type === "BURST" || bp.type === "MISSILES") out.push({ key: "s", label: "+1 shot" });
  out.push({ key: "c", label: "charges 20% faster" });
  if (bp.power > 1) out.push({ key: "p", label: "−1 power" });
  return out;
}

// ------------------------------------------------------------------ cards

/** Apply a card to a copy of the run's loadout (gear goes on; supplies top up). */
export function applyToLoadout(db: GameDB, l0: Loadout, c: Card): Loadout {
  const l = structuredClone(l0);
  const maxHull = l.hull ?? db.ships[l.ship]?.health ?? 30;
  switch (c.kind) {
    case "weapon":
      l.weapons.push(c.id!);
      break;
    case "upgrade":
      l.weapons[c.slot!] = c.id!;
      break;
    case "drone":
      l.drones = [...(l.drones ?? []), c.id!];
      break;
    case "augment":
      l.augments = [...(l.augments ?? []), c.id!];
      break;
    case "system":
      l.systems[c.system!] = (l.systems[c.system!] ?? 0) + 1;
      break;
    case "reactor":
      l.reactor += 2;
      break;
    case "reinforce":
      // One more stack on that system.
      l.reinforced = [...(l.reinforced ?? []), c.system!];
      break;
    case "crew":
      l.crew.push({ name: c.name!, race: c.race! });
      break;
    case "supplies":
      l.hull = maxHull + (c.maxHull ?? 0);
      l.hullNow = Math.min(l.hull, (l.hullNow ?? maxHull) + (c.hull ?? 0) + (c.maxHull ?? 0));
      l.missiles = Math.min(99, l.missiles + (c.missiles ?? 0));
      l.droneParts = Math.min(99, (l.droneParts ?? 0) + (c.parts ?? 0));
      break;
  }
  return l;
}

/**
 * Could the ship take this card? The hangar's own rules decide (slots, augment limit, max levels, crew
 * limit): price the result with unlimited scrap and look for anything but a cost complaint. Upgraded guns
 * are checked as their base weapon.
 */
export function installable(db: GameDB, l: Loadout, c: Card): boolean {
  if (c.kind === "drone" && !(l.systems.drones ?? 0)) return false;
  const after = applyToLoadout(db, l, c);
  const plain = { ...after, weapons: after.weapons.map((w) => parseUpgraded(w).base) };
  const p = priceLoadout(db, plain, Number.MAX_SAFE_INTEGER);
  return !p.errors.some((e) => !/^costs /.test(e));
}

/** Pick a tier: harder battles lean toward the good stuff. */
function rollTier(rng: Rng, d: number): 1 | 2 | 3 | 4 {
  const w = [Math.max(0.4, 3 - d / 25), 2, 0.5 + d / 40, 0.12 + d / 60];
  let r = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 4; i++) if ((r -= w[i]) < 0) return (i + 1) as 1 | 2 | 3 | 4;
  return 4;
}

/** From candidates (id, cost, rarity), one of the rolled tier, or the nearest tier that has any. */
function pickTiered<T extends { cost: number; rarity: number }>(rng: Rng, items: T[], tier: number): T | null {
  if (!items.length) return null;
  for (const dt of [0, 1, -1, 2, -2, 3, -3]) {
    const pool = items.filter((x) => tierOf(x.cost, x.rarity) === tier + dt);
    if (pool.length) return rng.pick(pool);
  }
  return rng.pick(items);
}

function gearCard(db: GameDB, l: Loadout, rng: Rng, tier: number): Card | null {
  const fits = (c: Card) => installable(db, l, c);
  const kinds: ("weapon" | "drone" | "augment")[] = [];
  // Weapons come up most; drones only with a drone system; augments now and then.
  for (const [k, n] of [["weapon", 5], ["drone", (l.systems.drones ?? 0) > 0 ? 2 : 0], ["augment", 2]] as const) for (let i = 0; i < n; i++) kinds.push(k);
  for (let tries = 0; tries < 6 && kinds.length; tries++) {
    const k = rng.pick(kinds);
    if (k === "weapon") {
      const pool = buyableWeapons(db).map((id) => db.weapons[id]).filter((w) => !/ARTILLERY|_SP$/.test(w.id) && fits({ kind: "weapon", id: w.id } as Card));
      const w = pickTiered(rng, pool, tier);
      if (w) return { kind: "weapon", id: w.id, title: w.title, blurb: weaponBlurb(w), tier: tierOf(w.cost, w.rarity), value: w.cost };
    } else if (k === "drone") {
      const pool = buyableDrones(db).map((id) => db.droneBPs![id]).filter((d) => fits({ kind: "drone", id: d.id } as Card));
      const d = pickTiered(rng, pool, tier);
      if (d) return { kind: "drone", id: d.id, title: d.title, blurb: `Drone · ${d.power} power`, tier: tierOf(d.cost, d.rarity), value: d.cost };
    } else {
      const pool = SURVIVAL.augments.map((id) => db.augments?.[id]).filter((a) => !!a && a.cost > 0 && fits({ kind: "augment", id: a.id } as Card)) as NonNullable<GameDB["augments"]>[string][];
      const a = pickTiered(rng, pool, tier);
      if (a) return { kind: "augment", id: a.id, title: a.title, blurb: a.desc || "Augment", tier: tierOf(a.cost, a.rarity), value: a.cost };
    }
  }
  return null;
}

function weaponBlurb(w: WeaponBP): string {
  const bits = [`${w.shots > 1 ? `${w.shots}× ` : ""}${w.damage} damage`, `${w.power} power`, `${w.cooldown}s`];
  if (w.ion) bits.push(`${w.ion} ion`);
  if (w.missiles) bits.push("uses missiles");
  return bits.join(" · ");
}

/** Weapon upgrades for guns that can take more, or a new crew member. */
function upgradeCard(db: GameDB, l: Loadout, rng: Rng, seed: number): Card | null {
  const out: Card[] = [];
  l.weapons.forEach((id, slot) => {
    const { base, mods } = parseUpgraded(id);
    if (modCount(mods) >= SURVIVAL.maxUpgrades) return;
    for (const o of upgradeOptions(db, id)) {
      const next = { ...mods, [o.key]: mods[o.key] + 1 };
      const bp = db.weapons[base];
      out.push({ kind: "upgrade", slot, id: upgradedId(base, next), title: `${bp?.title ?? base}: ${o.label}`, blurb: `Upgrade for your ${bp?.title ?? base} (up to ${SURVIVAL.maxUpgrades})`, tier: 2, value: SURVIVAL.upgradeValue });
    }
  });
  const races = hireableRaces(db);
  if (races.length) {
    const race = races[Math.abs(seed) % races.length];
    const name = randomCrewName(db, l.crew.map((c) => c.name), seed * 13 + l.crew.length);
    // A crew card weighs as much as a whole gun's worth of upgrades, so it isn't drowned out by them.
    const crew: Card = { kind: "crew", race, name, title: `Crew: ${name}`, blurb: `A ${db.crew[race]?.title ?? race} joins your crew`, tier: 2, value: db.crew[race]?.cost ?? 45 };
    if (installable(db, l, crew)) {
      const ups = out.filter((c) => installable(db, l, c));
      return ups.length && !rng.chance(0.25) ? rng.pick(ups) : crew;
    }
  }
  const ok = out.filter((c) => installable(db, l, c));
  return ok.length ? rng.pick(ok) : null;
}

/** A level on an installed system, a new system the hull has room for, or more reactor. */
function systemCard(db: GameDB, l: Loadout, rng: Rng): Card | null {
  const out: Card[] = [];
  for (const h of hullSystems(db, l.ship)) {
    const lv = l.systems[h.id] ?? h.base;
    const bp = db.systems[h.id];
    if (!bp || lv >= h.max) continue;
    const cost = lv === 0 ? bp.cost : bp.upgradeCost[lv - 1] ?? 60;
    out.push({ kind: "system", system: h.id, title: lv === 0 ? `Install ${bp.title ?? h.id}` : `${bp.title ?? h.id} level ${lv + 1}`, blurb: lv === 0 ? "A new system for your ship" : `Upgrade your ${(bp.title ?? h.id).toLowerCase()}${isSubsystem(h.id) ? "" : " (needs reactor power)"}`, tier: cost >= 80 ? 3 : 2, value: cost });
  }
  const ok = out.filter((c) => installable(db, l, c));
  // Now and then (rare, gold): reinforce one installed system, every bar 10% tougher. The same system can
  // be reinforced again, but each extra stack is rarer (weight 1/(stacks+1)²), and so is the card itself
  // once the ship's systems are well reinforced.
  const stacks = (id: SystemId) => (l.reinforced ?? []).filter((x) => x === id).length;
  const solid = hullSystems(db, l.ship).filter((h) => (l.systems[h.id] ?? h.base) > 0);
  const weights = solid.map((h) => 1 / (stacks(h.id) + 1) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  if (solid.length && rng.chance(SURVIVAL.reinforceChance * (total / solid.length))) {
    let r = rng.next() * total;
    let i = 0;
    while (i < solid.length - 1 && (r -= weights[i]) > 0) i++;
    const h = solid[i];
    const n = stacks(h.id) + 1;
    const name = db.systems[h.id]?.title ?? h.id;
    return { kind: "reinforce", system: h.id, title: `Reinforced ${name}${n > 1 ? ` ${"+".repeat(n - 1)}` : ""}`, blurb: `Every bar takes ${Math.round(RULES.reinforcePerStack * 100)}% more punishment before it breaks${n > 1 ? ` (stack ${n}: ${Math.round(RULES.reinforcePerStack * n * 100)}% in all)` : ""}`, tier: 4, value: 90 };
  }
  // The reactor comes up a third of the time (more power is what most upgrades end up needing).
  const reactor: Card = { kind: "reactor", title: "Reactor +2", blurb: "Two more bars of reactor power", tier: 2, value: RULES.reactorPrice(l.reactor) + RULES.reactorPrice(l.reactor + 1) };
  const canReactor = l.reactor + 2 <= reactorCap(db, l.ship) && installable(db, l, reactor);
  if (canReactor && (!ok.length || rng.chance(0.33))) return reactor;
  return ok.length ? rng.pick(ok) : null;
}

/** Hull, missiles and drone parts worth about `value`, leaning on what the ship is short of. */
export function suppliesCard(db: GameDB, l: Loadout, value: number): Card {
  const maxHull = l.hull ?? db.ships[l.ship]?.health ?? 30;
  const missing = Math.max(0, maxHull - (l.hullNow ?? maxHull));
  const usesMissiles = l.weapons.some((w) => (db.weapons[w]?.missiles ?? 0) > 0) || (l.drones ?? []).length > 0;
  let left = value;
  const hull = Math.min(missing, Math.round((left * (missing ? 0.6 : 0)) / SURVIVAL.hullValue));
  left -= hull * SURVIVAL.hullValue;
  const parts = (l.drones ?? []).length ? Math.max(1, Math.round((left * 0.35) / SURVIVAL.partValue)) : 0;
  left -= parts * SURVIVAL.partValue;
  const missiles = Math.min(SURVIVAL.maxMissiles, Math.max(usesMissiles || !hull ? 1 : 0, Math.round(left / SURVIVAL.missileValue)));
  left -= missiles * SURVIVAL.missileValue;
  // Whatever's left over tops up the hull (if it's short), else more parts or missiles past the cap.
  const extraHull = Math.min(missing - hull, Math.max(0, Math.round(left / SURVIVAL.hullValue)));
  left -= extraHull * SURVIVAL.hullValue;
  // Still something over (a full hull, missiles capped): reinforced plating, a point of max hull each.
  const plating = left >= SURVIVAL.platingValue ? Math.round(left / SURVIVAL.platingValue) : 0;
  const hullTotal = hull + extraHull;
  const v = hullTotal * SURVIVAL.hullValue + parts * SURVIVAL.partValue + missiles * SURVIVAL.missileValue + plating * SURVIVAL.platingValue;
  const bits = [hullTotal ? `+${hullTotal} hull` : "", plating ? `+${plating} max hull` : "", missiles ? `+${missiles} missiles` : "", parts ? `+${parts} drone parts` : ""].filter(Boolean);
  return { kind: "supplies", hull: hullTotal, missiles, parts, maxHull: plating, title: hullTotal ? "Repairs & supplies" : plating ? "Plating & supplies" : "Supplies", blurb: bits.join(" · "), tier: 1, value: v };
}

/**
 * The hand after winning battle `run.battle`: gear (tiered), a system or reactor upgrade, a weapon upgrade or
 * crew, and supplies worth about as much as the gear. After a boss there's an extra gear card and it's rare.
 */
export function drawCards(db: GameDB, run: SurvivalRun, seed: number): Card[] {
  const rng = new Rng(seed);
  const l = run.loadout;
  const d = SURVIVAL.difficulty(run.battle);
  const boss = isBoss(run.battle);
  const mini = isMiniBoss(run.battle);
  const n = Math.max(SURVIVAL.options.start, Math.min(SURVIVAL.options.max, run.options ?? SURVIVAL.options.start));
  // The flagship's gear is rare; a mini-boss's leans a tier up.
  const gear = gearCard(db, l, rng, boss ? 4 : mini ? Math.min(4, rollTier(rng, d) + 1) : rollTier(rng, d));
  // In order of priority, as many as the hand holds (supplies always make the last slot): the gear, a system
  // or reactor upgrade, a weapon upgrade or crew, and more gear.
  const more = gearCard(db, l, rng, rollTier(rng, d));
  const picks = [gear, systemCard(db, l, rng), upgradeCard(db, l, rng, seed), more && more.id !== gear?.id ? more : null].filter((c): c is Card => !!c);
  const hand = picks.slice(0, n - 1);
  // Now and then, a card that shows one more choice from then on (the first commonly, the second rarely).
  const plus = n < SURVIVAL.options.max && rng.chance(SURVIVAL.options.plusChance[n - SURVIVAL.options.start] ?? 0);
  if (plus) {
    const at = hand.findIndex((c) => c.kind !== "weapon" && c.kind !== "drone" && c.kind !== "augment");
    const card: Card = { kind: "options", title: "+1 choice", blurb: `One more reward card to choose from after every win (${n + 1} from now on, up to ${SURVIVAL.options.max})`, tier: n + 1 >= SURVIVAL.options.max ? 4 : 2, value: 60 };
    if (at >= 0) hand[at] = card;
    else hand.push(card);
  }
  // Supplies match the best thing on offer, so passing on a gun for repairs and missiles is a fair trade.
  const target = Math.max(30 + 3 * run.battle, ...hand.filter((c) => c.kind === "weapon" || c.kind === "drone" || c.kind === "augment").map((c) => c.value));
  hand.push(suppliesCard(db, l, target));
  // A thin hand (ship full up) still offers a choice: a smaller supplies package.
  while (hand.length < Math.min(n, 3)) hand.push(suppliesCard(db, l, Math.round(target * (0.6 - 0.15 * (hand.length - 1)))));
  return hand.slice(0, n);
}

/** Take a card: it goes on the ship and into the record. */
export function applyCard(db: GameDB, run: SurvivalRun, c: Card): void {
  if (c.kind === "options") run.options = Math.min(SURVIVAL.options.max, (run.options ?? SURVIVAL.options.start) + 1);
  else run.loadout = applyToLoadout(db, run.loadout, c);
  run.picks.push(c.title);
  if (c.tier === 4) run.rare++;
}

// ------------------------------------------------------------------ battles

export interface SurvivalEnemy {
  loadout: Loadout;
  difficulty: number;
  boss: boolean;
  /** A mini-boss: a player cruiser. */
  mini: boolean;
  hazard: HazardKind;
}

/** Battle n's opponent: a random single-player ship scaled to the difficulty, or the flagship. */
export function nextEnemy(db: GameDB, n: number, seed: number): SurvivalEnemy {
  const rng = new Rng(seed);
  const d = SURVIVAL.difficulty(n);
  const { level, scrapBonus } = difficultyToBot(d);
  const boss = isBoss(n);
  const mini = isMiniBoss(n);
  if (mini && db.hangar.length) {
    // A player cruiser, kitted out by the bot's own hangar logic with a growing budget.
    const ship = rng.pick(db.hangar);
    const loadout = botLoadout(db, ship, SURVIVAL.miniScrap + d * 6, level, seed);
    return { loadout, difficulty: d, boss: false, mini: true, hazard: "none" };
  }
  let ship: string;
  if (boss) {
    const stage = ((n / SURVIVAL.bossEvery - 1) % 3) + 1;
    const id = `BOSS_${stage}`;
    ship = n >= 4 * SURVIVAL.bossEvery && db.ships[`${id}_HARD`] ? `${id}_HARD` : id;
    if (!db.ships[ship]) ship = "";
  } else ship = "";
  if (!ship) {
    const pool = db.enemies.filter((e) => !/^BOSS_/.test(e) && db.ships[e]);
    ship = pool.length ? rng.pick(pool) : rng.pick(db.hangar);
  }
  const budget = Math.round(150 + d * 5 * (1 + scrapBonus));
  const loadout = db.ships[ship]?.enemy || /^BOSS_/.test(ship)
    ? enemyLoadout(db, ship, level, seed, Math.round(level * 6 + scrapBonus * 14), boss ? undefined : budget)
    : baseLoadout(db, ship);
  const hazard: HazardKind = !boss && n > 3 && rng.chance(SURVIVAL.hazardChance) ? rng.pick(SURVIVAL.hazards) : "none";
  return { loadout, difficulty: d, boss, mini: false, hazard };
}

/**
 * After a win: what the ship brings to the next battle. Hull, the crew still alive aboard (with their health
 * and skills; anyone left on the wreck is lost), system damage, missiles and drone parts.
 */
export function carryOver(run: SurvivalRun, ship: ShipState): void {
  const l = run.loadout;
  l.hull = ship.maxHull;
  l.hullNow = Math.max(1, ship.hull);
  l.missiles = ship.missiles;
  l.droneParts = ship.droneParts ?? 0;
  // The weapons in the order the player left them (they can be swapped around in battle).
  l.weapons = ship.weapons.map((w) => w.bp);
  l.crew = ship.crew
    .filter((c) => c.owner === ship.idx && !c.dead && c.dying === undefined && c.drone === undefined)
    // Where each one stood, or was walking to, is where they'll be after the jump.
    .map((c) => ({ name: c.name, race: c.race, xp: { ...c.xp }, hp: Math.max(1, Math.round(c.hp)), tile: c.home || c.tile }));
  l.damage = {};
  l.progress = {};
  for (const s of Object.values(ship.systems)) {
    if (!s) continue;
    if (s.damage > 0) l.damage[s.id] = s.damage;
    // Half-finished work carries over too: repairs, boarders' wrecking, a reinforced system's soaked damage.
    const p = { repair: s.damage > 0 ? s.repair : 0, wreck: s.wreck ?? 0, armour: s.armour ?? 0 };
    if (p.repair || p.wreck || p.armour) l.progress[s.id] = p;
  }
  // Enemy boarders still alive aboard come along (boarding drones don't: their ship is gone).
  l.boarders = ship.crew
    .filter((c) => c.owner !== ship.idx && !c.dead && c.dying === undefined && c.drone === undefined)
    .map((c) => ({ name: c.name, race: c.race, hp: Math.max(1, Math.round(c.hp)), tile: c.tile, xp: { ...c.xp } }));
}

export function score(run: SurvivalRun): number {
  const s = SURVIVAL.score;
  return run.won * s.win + run.bosses * s.boss + (run.minis ?? 0) * s.mini + run.picks.length * s.card + run.rare * s.rare;
}
