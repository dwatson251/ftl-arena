/** The hangar: price a loadout against a base hull, validate it, and build the ship it describes. */
import { baseSystemId, SUBSYSTEMS, V1_SYSTEMS, type GameDB, type SystemId } from "@ftl/data";
import { geometry, key } from "./geometry.ts";
import { raceOf, RACES, RULES, SKILLS, type SkillId } from "./rules.ts";
import type { CrewState, ShipState, SystemState } from "./state.ts";
import { crewPrice, itemPrice, obtainable, PRICING, reactorBarPrice, shipPrice, systemStepPrice, type PriceRules } from "./pricing.ts";

export interface Loadout {
  ship: string;
  /** Target level per system; omitted = the hull's starting level. 0 = not installed. */
  systems: Partial<Record<SystemId, number>>;
  reactor: number;
  weapons: string[];
  crew: CrewPick[];
  missiles: number;
  /** Server-built loadouts only: hull points override (enemy hulls are small; Survival's carried max hull). */
  hull?: number;
  /** Survival: hull points the ship starts the battle with (carried from the last fight). */
  hullNow?: number;
  /** Survival: system damage carried from the last fight. */
  damage?: Partial<Record<SystemId, number>>;
  /** Survival: progress carried from the last fight, per system: repairs toward the next mended bar,
   *  boarders' wrecking toward the next broken one, and damage a reinforced system has soaked. */
  progress?: Partial<Record<SystemId, { repair?: number; wreck?: number; armour?: number }>>;
  /** Survival: each room's oxygen (%, by room id) and which doors stood open, carried from the last fight. */
  o2?: Record<number, number>;
  doorsOpen?: boolean[];
  /** Survival: the power the player left each system on (bars wanted), and which guns and drones were on. */
  power?: Partial<Record<SystemId, number>>;
  weaponsOn?: boolean[];
  dronesOn?: boolean[];
  /** Survival: the teleporter's charge (seconds) carried from the last fight; omitted = ready. */
  tele?: number;
  /** Survival: systems reinforced by reward cards, once per stack (each stack: 10% more health per bar). */
  reinforced?: SystemId[];
  /** Survival: enemy boarders still aboard after the last fight; they fight on for the next enemy. */
  boarders?: { name: string; race: string; hp: number; tile: string; xp?: Partial<Record<SkillId, number>> }[];
  /** Augment ids, up to 3 (FTL's limit); stackable augments may repeat. */
  augments?: string[];
  /** Drone ids (up to the hull's drone slots) and drone parts. */
  drones?: string[];
  droneParts?: number;
  /** "ftl": brought in from an FTL save and not changed since (what a "Bring your own ship" lobby accepts). */
  origin?: "ftl";
}

export const MAX_AUGMENTS = 3;

export interface CrewPick {
  name: string;
  race: string;
  /** Skill experience to start with (imported from an FTL run); clamped to each skill's maximum. */
  xp?: Partial<Record<SkillId, number>>;
  /** Survival: health carried from the last fight. */
  hp?: number;
  /** Survival: where they stood (or were headed) when the ship jumped; they start the next fight there. */
  tile?: string;
}

export interface PriceLine {
  item: string;
  scrap: number;
}

export interface Priced {
  ok: boolean;
  total: number;
  lines: PriceLine[];
  errors: string[];
}

/** Systems the hull has a room for, with their starting level (0 = room present but not installed). */
export function hullSystems(db: GameDB, shipId: string, unlimited = false): { id: SystemId; base: number; max: number; room: number }[] {
  const s = db.ships[shipId];
  const out: { id: SystemId; base: number; max: number; room: number }[] = [];
  const seenRoom = new Set<number>();
  for (const slot of s.systems) {
    if (!V1_SYSTEMS.includes(slot.id) || out.some((o) => o.id === slot.id)) continue;
    // Medbay and clone bay share a room in FTL (only one can be installed); nothing else may share.
    const shared = slot.id === "medbay" || slot.id === "clonebay";
    if (seenRoom.has(slot.room) && !shared) continue;
    seenRoom.add(slot.room);
    const bp = db.systems[baseSystemId(slot.id)];
    // Unrestricted mode lifts the weapons and drone systems to the most power their slots could ever use (the
    // hungriest weapon or drone in every slot); the reactor follows (reactorCap).
    let max = bp ? bp.maxPower : Math.max(4, slot.power, slot.max ?? 0);
    if (unlimited && slot.id === "weapons") max = Math.max(max, (s.weaponSlots ?? 4) * maxPower(buyableWeapons(db).map((w) => db.weapons[w]?.power ?? 0)));
    if (unlimited && slot.id === "drones") max = Math.max(max, (s.droneSlots ?? 0) * maxPower(buyableDrones(db).map((d) => db.droneBPs?.[d]?.power ?? 0)));
    out.push({ id: slot.id, base: slot.start ? slot.power : 0, max, room: slot.room });
  }
  return out;
}

const maxPower = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0);

/**
 * The most reactor a hull may buy: FTL's 25, or in unrestricted mode enough to run its eight biggest systems
 * at their (raised) maximum at once (subsystems need none; the medbay and clone bay count once).
 */
export function reactorCap(db: GameDB, shipId: string, unlimited = false): number {
  if (!unlimited) return RULES.reactorMax;
  const main = hullSystems(db, shipId, true).filter((h) => !isSubsystem(h.id));
  const bay = Math.max(0, ...main.filter((h) => h.id === "medbay" || h.id === "clonebay").map((h) => h.max));
  const maxes = [...main.filter((h) => h.id !== "medbay" && h.id !== "clonebay").map((h) => h.max), ...(bay ? [bay] : [])].sort((a, b) => b - a);
  return Math.max(RULES.reactorMax, maxes.slice(0, RULES.maxSystems).reduce((a, b) => a + b, 0));
}

/**
 * Reactor bars needed to run everything at once: every main system at its level, with weapons and drones
 * capped by what's fitted (subsystems run without reactor power).
 */
export function fullPowerNeed(db: GameDB, l: Loadout): number {
  let n = 0;
  for (const [id, lv] of Object.entries(l.systems) as [SystemId, number][]) {
    if (!lv || ["pilot", "sensors", "doors"].includes(id)) continue;
    if (id === "weapons") n += Math.min(lv, l.weapons.reduce((a, w) => a + (db.weapons[w]?.power ?? 0), 0));
    else if (id === "drones") n += Math.min(lv, (l.drones ?? []).reduce((a, d) => a + (db.droneBPs?.[d]?.power ?? 0), 0));
    else n += lv;
  }
  return n;
}

export function baseLoadout(db: GameDB, shipId: string): Loadout {
  const s = db.ships[shipId];
  const systems: Partial<Record<SystemId, number>> = {};
  for (const h of hullSystems(db, shipId)) systems[h.id] = h.base;
  const pool = db.names.length ? db.names : NAMES;
  const crew = s.crewRaces.filter((r) => RACES[r]).map((race, i) => ({ race, name: pool[(hashStr(shipId) + i * 7) % pool.length] }));
  // Missiles start at 0: buy them in the hangar.
  return {
    ship: shipId, systems, reactor: s.maxPower, weapons: s.weapons.filter((w) => db.weapons[w]), crew, missiles: 0,
    augments: [...(s.augments ?? [])].filter((a) => db.augments?.[a]), drones: (s.drones ?? []).filter((d) => db.droneBPs?.[d]),
    droneParts: s.droneParts ?? 0,
  };
}

/** Drones a player may buy: anything sold in stores (rarity > 0) and every hull's starting drone. */
export function buyableDrones(db: GameDB): string[] {
  const starters = new Set(db.hangar.flatMap((h) => db.ships[h].drones ?? []));
  return Object.values(db.droneBPs ?? {})
    .filter((d) => d.cost > 0 && (d.rarity > 0 || starters.has(d.id)))
    .sort((a, b) => a.type.localeCompare(b.type) || a.cost - b.cost)
    .map((d) => d.id);
}

/** Races a player may hire: every race with a blueprint and known traits. */
export function hireableRaces(db: GameDB): string[] {
  return Object.keys(RACES).filter((r) => db.crew[r] && !RACES[r].drone);
}

export function randomCrewName(db: GameDB, taken: string[], seed: number): string {
  const pool = (db.names.length ? db.names : NAMES).filter((n) => !taken.includes(n));
  return pool.length ? pool[Math.abs(seed) % pool.length] : `Crew ${taken.length + 1}`;
}

const hashStr = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Weapons a player may buy: anything sold in stores, plus every hangar hull's starting weapon. */
export function buyableWeapons(db: GameDB): string[] {
  const starters = new Set(db.hangar.flatMap((h) => db.ships[h].weapons));
  return Object.values(db.weapons)
    .filter((w) => w.cost > 0 && (w.rarity > 0 || starters.has(w.id)) && !w.id.startsWith("BOSS") && !w.id.includes("ENEMY"))
    .sort((a, b) => a.type.localeCompare(b.type) || a.cost - b.cost)
    .map((w) => w.id);
}

/**
 * `crewless`: autonomous ships are on, so a build may start with no crew at all. `rules`: the Scrap costs
 * mode (a price for the hull, Tournament's rarity prices) and whether unobtainable items are allowed.
 */
export function priceLoadout(db: GameDB, l: Loadout, scrap: number, pool: string[] = [], unlimited = false, crewless = false, rules: PriceRules = {}): Priced {
  const errors: string[] = [];
  const lines: PriceLine[] = [];
  const ship = db.ships[l.ship];
  if (!ship) return { ok: false, total: 0, lines, errors: [`unknown ship ${l.ship}`] };
  if (!db.hangar.includes(l.ship) || (pool.length && !pool.includes(l.ship))) errors.push(`${l.ship} is not allowed`);
  const base = baseLoadout(db, l.ship);
  const costs = rules.costs ?? "none";
  // Ship Expenses / Tournament: the hull itself costs scrap.
  if (costs !== "none") lines.push({ item: `Ship: ${ship.title}`, scrap: shipPrice(db, l.ship, base) });
  // Unobtainable items off: nothing a normal run can't give you beyond what the hull came with.
  if (rules.unobtainable === false) {
    const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
    const check = (kind: "weapons" | "augments" | "crew", have: string[], stock: string[], name: (id: string) => string) => {
      const had = count(stock);
      for (const [id, n] of count(have)) if (n > (had.get(id) ?? 0) && !obtainable(db, kind, id)) errors.push(`${name(id)} can't be had in a normal run (stock fits only)`);
    };
    check("weapons", l.weapons, base.weapons, (id) => db.weapons[id]?.title ?? id);
    check("augments", l.augments ?? [], base.augments ?? [], (id) => db.augments?.[id]?.title ?? id);
    check("crew", l.crew.map((c) => c.race), base.crew.map((c) => c.race), (id) => db.crew[id]?.title ?? id);
  }
  for (const h of hullSystems(db, l.ship, unlimited)) {
    const want = l.systems[h.id] ?? h.base;
    // Swapping the medbay for a clone bay (or back; same room) is the one allowed removal.
    const other = h.id === "medbay" ? "clonebay" : h.id === "clonebay" ? "medbay" : null;
    const swapped = !!other && (l.systems[other] ?? 0) > 0;
    if (!Number.isInteger(want) || (want < h.base && !swapped)) errors.push(`${h.id}: can't go below level ${h.base}`);
    if (want > h.max) errors.push(`${h.id}: max level is ${h.max}`);
    const bp = db.systems[h.id];
    if (!bp || want <= h.base) continue;
    let cost = 0;
    // (Past FTL's table, unrestricted mode, each bar costs the last listed price.)
    for (let lv = h.base; lv < want; lv++) cost += systemStepPrice(bp, lv, costs);
    lines.push({ item: `${h.id} ${h.base}→${want}`, scrap: cost });
  }
  for (const k of Object.keys(l.systems)) {
    if (!hullSystems(db, l.ship, unlimited).some((h) => h.id === k) && (l.systems[k as SystemId] ?? 0) > 0)
      errors.push(`${k}: this hull has no room for it`);
  }
  if ((l.systems.medbay ?? 0) > 0 && (l.systems.clonebay ?? 0) > 0) errors.push("medbay and clone bay share a room: install one");
  const installed = Object.entries(l.systems).filter(([id, lv]) => (lv ?? 0) > 0 && !isSubsystem(id as SystemId)).length;
  if (installed > RULES.maxSystems) errors.push(`FTL allows at most ${RULES.maxSystems} systems (subsystems don't count)`);
  if (!Number.isInteger(l.reactor) || l.reactor < base.reactor) errors.push(`reactor can't go below ${base.reactor}`);
  const reactorMax = reactorCap(db, l.ship, unlimited);
  if (l.reactor > reactorMax) errors.push(`reactor max is ${reactorMax}`);
  let rc = 0;
  for (let lv = base.reactor; lv < l.reactor; lv++) rc += reactorBarPrice(lv, base.reactor, RULES.reactorPrice, costs);
  if (rc) lines.push({ item: `reactor ${base.reactor}→${l.reactor}`, scrap: rc });

  if (l.weapons.length > ship.weaponSlots) errors.push(`only ${ship.weaponSlots} weapon slots`);
  const buyable = new Set(buyableWeapons(db));
  const left = [...base.weapons];
  let weaponsBought = 0;
  for (const w of l.weapons) {
    const i = left.indexOf(w);
    if (i >= 0) {
      left.splice(i, 1);
      continue;
    }
    const bp = db.weapons[w];
    if (!bp || !buyable.has(w)) {
      errors.push(`weapon ${w} is not for sale`);
      continue;
    }
    lines.push({ item: `buy ${bp.title}`, scrap: itemPrice(db, "weapon", w, costs, weaponsBought++) });
  }
  for (const w of left) {
    const bp = db.weapons[w];
    if (bp) lines.push({ item: `sell ${bp.title}`, scrap: -Math.floor(itemPrice(db, "weapon", w, costs) * RULES.sellRefund) });
  }
  const minCrew = crewless ? 0 : 1;
  if (!Array.isArray(l.crew) || l.crew.length < minCrew || l.crew.length > RULES.maxCrew) errors.push(`crew must be ${minCrew}-${RULES.maxCrew}`);
  else {
    // Starting crew are free; each extra member of a race costs that race's blueprint price.
    const free = new Map<string, number>();
    for (const c of base.crew) free.set(c.race, (free.get(c.race) ?? 0) + 1);
    let hired = 0;
    for (const c of l.crew) {
      if (!RACES[c.race] || RACES[c.race].drone || !db.crew[c.race]) {
        errors.push(`unknown race ${c.race}`);
        continue;
      }
      if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 16) errors.push("crew names must be 1-16 characters");
      const f = free.get(c.race) ?? 0;
      if (f > 0) free.set(c.race, f - 1);
      else if (costs === "tournament" && PRICING.tournament.stockOnlyCrew.includes(c.race)) errors.push(`${db.crew[c.race].title} crew only come with a hull in a Tournament`);
      else lines.push({ item: `hire ${c.name} (${db.crew[c.race].title})`, scrap: crewPrice(db, c.race, costs, hired++) });
    }
  }
  if (!Number.isInteger(l.missiles) || l.missiles < 0 || l.missiles > 99) errors.push("missiles must be 0-99");
  if (l.missiles > base.missiles) lines.push({ item: `${l.missiles - base.missiles} missiles`, scrap: (l.missiles - base.missiles) * RULES.missilePrice });
  // Drones: like weapons (starting ones free, sold for half), plus drone parts.
  const dr = l.drones ?? [];
  if (dr.length > (ship.droneSlots ?? 0)) errors.push(`only ${ship.droneSlots ?? 0} drone slots`);
  // Drones without the drone control system are allowed (the hangar warns): they just can't be launched.
  const leftD = [...(base.drones ?? [])];
  const buyD = new Set(buyableDrones(db));
  for (const d of dr) {
    const i = leftD.indexOf(d);
    if (i >= 0) {
      leftD.splice(i, 1);
      continue;
    }
    const bp = db.droneBPs?.[d];
    if (!bp || !buyD.has(d)) errors.push(`drone ${d} is not for sale`);
    else lines.push({ item: `buy ${bp.title}`, scrap: bp.cost });
  }
  for (const d of leftD) {
    const bp = db.droneBPs?.[d];
    if (bp) lines.push({ item: `sell ${bp.title}`, scrap: -Math.floor(bp.cost * RULES.sellRefund) });
  }
  const parts = l.droneParts ?? 0;
  if (!Number.isInteger(parts) || parts < 0 || parts > 99) errors.push("drone parts must be 0-99");
  // The hacking drone is built from a drone part (one per launch, as in FTL).
  if ((l.systems.hacking ?? 0) > 0 && parts < 1) errors.push("hacking needs at least 1 drone part (each hacking drone uses one)");
  if (parts > (base.droneParts ?? 0)) lines.push({ item: `${parts - (base.droneParts ?? 0)} drone parts`, scrap: (parts - (base.droneParts ?? 0)) * RULES.dronePartPrice });
  const augs = l.augments ?? [];
  if (augs.length > MAX_AUGMENTS) errors.push(`at most ${MAX_AUGMENTS} augments`);
  const freeAugs = [...(base.augments ?? [])];
  let augsBought = 0;
  for (const a of augs) {
    const bp = db.augments?.[a];
    if (!bp) {
      errors.push(`unknown augment ${a}`);
      continue;
    }
    if (!bp.stackable && augs.filter((x) => x === a).length > 1) errors.push(`${bp.title} doesn't stack`);
    const i = freeAugs.indexOf(a);
    if (i >= 0) freeAugs.splice(i, 1);
    else lines.push({ item: `augment ${bp.title}`, scrap: itemPrice(db, "augment", a, costs, augsBought++) });
  }
  const total = lines.reduce((a, b) => a + b.scrap, 0);
  if (total > scrap) errors.push(`costs ${total} scrap, budget is ${scrap}`);
  return { ok: errors.length === 0, total, lines, errors };
}

const NAMES = [
  "Ash", "Bex", "Cato", "Dara", "Ezra", "Fen", "Gale", "Hollis", "Ines", "Jory", "Kade", "Lux", "Mara", "Nico",
  "Oren", "Pax", "Quill", "Rhea", "Soren", "Tamsin", "Uma", "Vale", "Wren", "Yara", "Zed",
];

/** Tiles crew can't be sent to: the medbay's and clone bay's equipment. */
export function blockedTiles(ship: ShipState): Set<string> {
  return new Set(Object.values(ship.systems).flatMap((s) => (s?.blocked ? [s.blocked] : [])));
}

/** A system's carried progress, each part clamped to 0..1 (only what's there). */
function carried(p: { repair?: number; wreck?: number; armour?: number } | undefined): Partial<SystemState> {
  if (!p) return {};
  const c = (v: number | undefined) => Math.max(0, Math.min(0.999, Number(v) || 0));
  return { ...(p.repair ? { repair: c(p.repair) } : {}), ...(p.wreck ? { wreck: c(p.wreck) } : {}), ...(p.armour ? { armour: c(p.armour) } : {}) };
}

export function buildShip(db: GameDB, l: Loadout, idx: 0 | 1, player: string, pickName: (n: string[]) => string, unlimited = false): ShipState {
  const bp = db.ships[l.ship];
  const layout = db.layouts[bp.layout];
  const g = geometry(layout);
  const systems: ShipState["systems"] = {};
  for (const h of hullSystems(db, l.ship, unlimited || !!bp.enemy)) {
    const level = l.systems[h.id] ?? h.base;
    if (level <= 0) continue;
    const slot = bp.systems.find((s) => s.id === h.id)!;
    const tiles = g.roomTiles.get(slot.room) ?? [];
    const bay = h.id === "medbay" || h.id === "clonebay";
    const station = slot.station >= 0 && !bay ? tiles[slot.station] ?? tiles[0] ?? "" : "";
    // The bay's equipment takes one tile, so a 2x2 medbay or clone bay holds three crew (FTL's default slot is 1,
    // or 0 in a one-tile room).
    const blocked = bay && slot.station >= 0 && tiles.length > 1 ? tiles[slot.station] ?? tiles[0] : undefined;
    systems[h.id] = {
      id: h.id, room: slot.room, level, power: 0, damage: Math.max(0, Math.min(level, Math.round(l.damage?.[h.id] ?? 0))), repair: 0, ion: 0, ionTimer: 0, station, fireDmg: 0, bonus: 0,
      facing: station ? slot.facing ?? "up" : undefined,
      ...(l.reinforced?.includes(h.id) ? { reinforced: l.reinforced.filter((x) => x === h.id).length } : {}),
      ...carried(l.progress?.[h.id]),
      ...(blocked ? { blocked } : {}),
      ...(slot.weapon && db.weapons[slot.weapon] ? { weapon: slot.weapon, charge: 0 } : {}),
    } satisfies SystemState;
  }
  const ship: ShipState = {
    idx, player, bp: l.ship, layout: bp.layout, hull: Math.min(l.hull ?? bp.health, l.hullNow ?? l.hull ?? bp.health), maxHull: l.hull ?? bp.health, reactor: l.reactor, systems,
    rooms: layout.rooms.map((r) => ({ id: r.id, o2: Math.max(0, Math.min(100, l.o2?.[r.id] ?? 100)), fires: {}, breaches: {} })),
    doors: layout.doors.map((_, i) => (l.doorsOpen?.length === layout.doors.length ? !!l.doorsOpen[i] : false)),
    crew: [],
    weapons: l.weapons.map((w, slot) => ({ slot, bp: w, powered: false, charge: 0, volleys: 0, target: null, autofire: false, boost: 0 })),
    missiles: l.missiles, shieldLayers: 0, shieldCharge: 0, evasion: 0,
    augments: (l.augments ?? []).filter((a) => db.augments?.[a]),
    drones: (l.drones ?? []).filter((d) => db.droneBPs?.[d]).map((bp, slot) => ({ slot, bp, powered: false, deployed: false, angle: slot * 2.1, cd: 1 })),
    droneParts: l.droneParts ?? 0,
    superShield: (l.augments ?? []).includes("ENERGY_SHIELD") ? RULES.zoltanShield : 0,
    // The teleporter starts a fight ready (no warm-up); Survival carries a cooldown over from the last one.
    tele: l.tele ?? 99,
    stats: { shotsFired: 0, hits: 0, misses: 0, blocked: 0, damageDealt: 0 },
  };
  // Stations first, in the order a captain would fill them; the rest stand in free tiles.
  const order: SystemId[] = ["pilot", "weapons", "shields", "engines", "sensors", "doors"];
  const taken = new Set<string>();
  const spots: string[] = [];
  for (const id of order) {
    const st = systems[id]?.station;
    if (st && !taken.has(st)) {
      spots.push(st);
      taken.add(st);
    }
  }
  // The Rebel flagship keeps one crew member in each of its (isolated) weapon rooms, as in FTL.
  if (/^BOSS_/.test(l.ship))
    for (const id of ["artillery", "artillery2", "artillery3", "artillery4"] as SystemId[]) {
      const t = systems[id] ? g.roomTiles.get(systems[id]!.room)?.[0] : undefined;
      if (t && !taken.has(t)) {
        spots.push(t);
        taken.add(t);
      }
    }
  const blocked = blockedTiles(ship);
  for (const k of g.tiles.keys()) if (!taken.has(k) && !blocked.has(k)) spots.push(k);
  // Crew who carry a position (Survival, after a jump) keep it; everyone else takes the next free spot.
  const kept = new Set<string>();
  for (const c of l.crew) if (c.tile && g.tiles.has(c.tile) && !blocked.has(c.tile) && !kept.has(c.tile)) kept.add(c.tile);
  const free = spots.filter((t) => !kept.has(t));
  const claimed = new Set<string>();
  let next = 0;
  for (let i = 0; i < l.crew.length; i++) {
    const want = l.crew[i].tile;
    const tile = want && kept.has(want) && !claimed.has(want) ? want : (free[next++] ?? spots[0]);
    claimed.add(tile);
    const [x, y] = tile.split(",").map(Number);
    const pick = l.crew[i];
    const t = raceOf(pick.race);
    ship.crew.push({
      id: idx * 100 + i, name: String(pick.name || pickName(NAMES)).slice(0, 16), race: RACES[pick.race] && !RACES[pick.race].drone ? pick.race : "human",
      hp: Math.max(1, Math.min(t.hp, pick.hp ?? t.hp)), maxHp: t.hp, x, y, tile,
      path: [], home: tile, task: "idle",
      xp: Object.fromEntries(SKILLS.map((s) => [s, Math.max(0, Math.min(RULES.skillXp[s][1], Math.round(Number(pick.xp?.[s]) || 0)))])) as CrewState["xp"],
      stun: 0, dead: false, owner: idx,
    });
  }
  autoPower(db, ship);
  carriedPower(l, ship);
  // Weapon Pre-igniter: weapons start the battle charged.
  if (ship.augments?.includes("WEAPON_PREIGNITE"))
    for (const w of ship.weapons) if (w.powered && db.weapons[w.bp]) {
      w.charge = db.weapons[w.bp].cooldown;
      w.volleys = db.weapons[w.bp].chargeLevels;
    }
  return ship;
}

/** How many of an augment a ship carries (stackable ones count each copy). */
export function augCount(ship: ShipState, id: string): number {
  return (ship.augments ?? []).filter((a) => a === id).length;
}

export function isSubsystem(id: SystemId): boolean {
  return SUBSYSTEMS.includes(id);
}

/** Usable bars: level minus damage minus ion. */
export function usable(s: SystemState): number {
  return Math.max(0, s.level - s.damage - s.ion);
}

export function reactorUsed(ship: ShipState): number {
  let n = 0;
  for (const s of Object.values(ship.systems)) if (s && !isSubsystem(s.id)) n += s.power;
  return n;
}

/** Opening power plan: shields, engines, one bar of oxygen, every weapon that fits, medbay. */
/**
 * Survival: the power the player left things on in the last fight. Each system wants its old bars back (it
 * powers up to them once repaired, if there's reactor to spare), and guns and drones keep their on/off state.
 */
function carriedPower(l: Loadout, ship: ShipState): void {
  if (l.power) {
    for (const s of Object.values(ship.systems)) {
      const want = s ? l.power[s.id] : undefined;
      if (!s || want === undefined) continue;
      s.want = want;
      if (s.power > want) s.power = want;
    }
  }
  l.weaponsOn?.forEach((on, i) => {
    const w = ship.weapons[i];
    if (!w) return;
    w.want = on;
    if (!on) w.powered = false;
  });
  l.dronesOn?.forEach((on, i) => {
    const d = ship.drones?.[i];
    if (d) d.want = on;
  });
}

export function autoPower(db: GameDB, ship: ShipState): void {
  for (const s of Object.values(ship.systems)) if (s) s.power = isSubsystem(s.id) ? usable(s) : 0;
  const free = () => ship.reactor - reactorUsed(ship);
  const give = (id: SystemId, n: number) => {
    const s = ship.systems[id];
    if (!s) return 0;
    const g = Math.max(0, Math.min(n, usable(s) - s.power, free()));
    s.power += g;
    return g;
  };
  give("shields", 99);
  give("engines", 99);
  give("oxygen", 1);
  for (const w of ship.weapons) {
    const need = db.weapons[w.bp]?.power ?? 1;
    const ws = ship.systems.weapons;
    if (!ws) break;
    // A missile weapon with no missiles to fire stays off.
    if ((db.weapons[w.bp]?.missiles ?? 0) > ship.missiles) continue;
    const used = ship.weapons.filter((x) => x.powered).reduce((a, x) => a + (db.weapons[x.bp]?.power ?? 1), 0);
    if (used + need > usable(ws)) continue;
    if (ws.power < used + need) give("weapons", used + need - ws.power);
    if (ws.power >= used + need) w.powered = true;
  }
  // Artillery is the hull's main gun (the Osprey starts with it powered).
  for (const id of ["artillery", "artillery2", "artillery3", "artillery4"] as SystemId[]) give(id, 99);
  give("medbay", 1);
  give("clonebay", 1);
  give("teleporter", 99);
  give("mind", 99);
  give("cloaking", 99);
  give("hacking", 99);
}

export { key };
