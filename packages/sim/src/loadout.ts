/** The hangar: price a loadout against a base hull, validate it, and build the ship it describes. */
import { SUBSYSTEMS, V1_SYSTEMS, type GameDB, type SystemId } from "@ftl/data";
import { geometry, key } from "./geometry.ts";
import { raceOf, RACES, RULES, SKILLS } from "./rules.ts";
import type { CrewState, ShipState, SystemState } from "./state.ts";

export interface Loadout {
  ship: string;
  /** Target level per system; omitted = the hull's starting level. 0 = not installed. */
  systems: Partial<Record<SystemId, number>>;
  reactor: number;
  weapons: string[];
  crew: CrewPick[];
  missiles: number;
  /** Server-built bot loadouts only: hull points override (enemy hulls are small). */
  hull?: number;
}

export interface CrewPick {
  name: string;
  race: string;
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
export function hullSystems(db: GameDB, shipId: string): { id: SystemId; base: number; max: number; room: number }[] {
  const s = db.ships[shipId];
  const out: { id: SystemId; base: number; max: number; room: number }[] = [];
  const seenRoom = new Set<number>();
  for (const slot of s.systems) {
    if (!V1_SYSTEMS.includes(slot.id) || out.some((o) => o.id === slot.id)) continue;
    // Medbay and clonebay share a room in FTL; v1 has only the medbay.
    if (seenRoom.has(slot.room) && slot.id !== "medbay") continue;
    seenRoom.add(slot.room);
    const bp = db.systems[slot.id];
    const max = bp ? bp.maxPower : 3;
    out.push({ id: slot.id, base: slot.start ? slot.power : 0, max, room: slot.room });
  }
  return out;
}

export function baseLoadout(db: GameDB, shipId: string): Loadout {
  const s = db.ships[shipId];
  const systems: Partial<Record<SystemId, number>> = {};
  for (const h of hullSystems(db, shipId)) systems[h.id] = h.base;
  const pool = db.names.length ? db.names : NAMES;
  const crew = s.crewRaces.filter((r) => RACES[r]).map((race, i) => ({ race, name: pool[(hashStr(shipId) + i * 7) % pool.length] }));
  return { ship: shipId, systems, reactor: s.maxPower, weapons: s.weapons.filter((w) => db.weapons[w]), crew, missiles: s.missiles };
}

/** Races a player may hire: every race with a blueprint and known traits. */
export function hireableRaces(db: GameDB): string[] {
  return Object.keys(RACES).filter((r) => db.crew[r]);
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

export function priceLoadout(db: GameDB, l: Loadout, scrap: number, pool: string[] = []): Priced {
  const errors: string[] = [];
  const lines: PriceLine[] = [];
  const ship = db.ships[l.ship];
  if (!ship) return { ok: false, total: 0, lines, errors: [`unknown ship ${l.ship}`] };
  if (!db.hangar.includes(l.ship) || (pool.length && !pool.includes(l.ship))) errors.push(`${l.ship} is not allowed`);
  const base = baseLoadout(db, l.ship);
  for (const h of hullSystems(db, l.ship)) {
    const want = l.systems[h.id] ?? h.base;
    if (!Number.isInteger(want) || want < h.base) errors.push(`${h.id}: can't go below level ${h.base}`);
    if (want > h.max) errors.push(`${h.id}: max level is ${h.max}`);
    const bp = db.systems[h.id];
    if (!bp || want <= h.base) continue;
    let cost = 0;
    let from = h.base;
    if (from === 0) {
      cost += bp.cost;
      from = 1;
    }
    for (let lv = from; lv < want; lv++) cost += bp.upgradeCost[lv - 1] ?? 0;
    lines.push({ item: `${h.id} ${h.base}→${want}`, scrap: cost });
  }
  for (const k of Object.keys(l.systems)) {
    if (!hullSystems(db, l.ship).some((h) => h.id === k) && (l.systems[k as SystemId] ?? 0) > 0)
      errors.push(`${k}: this hull has no room for it`);
  }
  if (!Number.isInteger(l.reactor) || l.reactor < base.reactor) errors.push(`reactor can't go below ${base.reactor}`);
  if (l.reactor > RULES.reactorMax) errors.push(`reactor max is ${RULES.reactorMax}`);
  let rc = 0;
  for (let lv = base.reactor; lv < l.reactor; lv++) rc += RULES.reactorPrice(lv);
  if (rc) lines.push({ item: `reactor ${base.reactor}→${l.reactor}`, scrap: rc });

  if (l.weapons.length > ship.weaponSlots) errors.push(`only ${ship.weaponSlots} weapon slots`);
  const buyable = new Set(buyableWeapons(db));
  const left = [...base.weapons];
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
    lines.push({ item: `buy ${bp.title}`, scrap: bp.cost });
  }
  for (const w of left) {
    const bp = db.weapons[w];
    if (bp) lines.push({ item: `sell ${bp.title}`, scrap: -Math.floor(bp.cost * RULES.sellRefund) });
  }
  if (!Array.isArray(l.crew) || l.crew.length < 1 || l.crew.length > RULES.maxCrew) errors.push(`crew must be 1-${RULES.maxCrew}`);
  else {
    // Starting crew are free; each extra member of a race costs that race's blueprint price.
    const free = new Map<string, number>();
    for (const c of base.crew) free.set(c.race, (free.get(c.race) ?? 0) + 1);
    for (const c of l.crew) {
      if (!RACES[c.race] || !db.crew[c.race]) {
        errors.push(`unknown race ${c.race}`);
        continue;
      }
      if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 16) errors.push("crew names must be 1-16 characters");
      const f = free.get(c.race) ?? 0;
      if (f > 0) free.set(c.race, f - 1);
      else lines.push({ item: `hire ${c.name} (${db.crew[c.race].title})`, scrap: db.crew[c.race].cost });
    }
  }
  if (!Number.isInteger(l.missiles) || l.missiles < 0 || l.missiles > 99) errors.push("missiles must be 0-99");
  if (l.missiles > base.missiles) lines.push({ item: `${l.missiles - base.missiles} missiles`, scrap: (l.missiles - base.missiles) * RULES.missilePrice });
  const total = lines.reduce((a, b) => a + b.scrap, 0);
  if (total > scrap) errors.push(`costs ${total} scrap, budget is ${scrap}`);
  return { ok: errors.length === 0, total, lines, errors };
}

const NAMES = [
  "Ash", "Bex", "Cato", "Dara", "Ezra", "Fen", "Gale", "Hollis", "Ines", "Jory", "Kade", "Lux", "Mara", "Nico",
  "Oren", "Pax", "Quill", "Rhea", "Soren", "Tamsin", "Uma", "Vale", "Wren", "Yara", "Zed",
];

export function buildShip(db: GameDB, l: Loadout, idx: 0 | 1, player: string, pickName: (n: string[]) => string): ShipState {
  const bp = db.ships[l.ship];
  const layout = db.layouts[bp.layout];
  const g = geometry(layout);
  const systems: ShipState["systems"] = {};
  for (const h of hullSystems(db, l.ship)) {
    const level = l.systems[h.id] ?? h.base;
    if (level <= 0) continue;
    const slot = bp.systems.find((s) => s.id === h.id)!;
    const tiles = g.roomTiles.get(slot.room) ?? [];
    const station = slot.station >= 0 && h.id !== "medbay" ? tiles[slot.station] ?? tiles[0] ?? "" : "";
    systems[h.id] = {
      id: h.id, room: slot.room, level, power: 0, damage: 0, repair: 0, ion: 0, ionTimer: 0, station, fireDmg: 0, bonus: 0,
    } satisfies SystemState;
  }
  const ship: ShipState = {
    idx, player, bp: l.ship, layout: bp.layout, hull: l.hull ?? bp.health, maxHull: l.hull ?? bp.health, reactor: l.reactor, systems,
    rooms: layout.rooms.map((r) => ({ id: r.id, o2: 100, fires: {}, breaches: {} })),
    doors: layout.doors.map(() => false),
    crew: [],
    weapons: l.weapons.map((w, slot) => ({ slot, bp: w, powered: false, charge: 0, volleys: 0, target: null, autofire: false, boost: 0 })),
    missiles: l.missiles, shieldLayers: 0, shieldCharge: 0, evasion: 0,
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
  for (const k of g.tiles.keys()) if (!taken.has(k)) spots.push(k);
  for (let i = 0; i < l.crew.length; i++) {
    const tile = spots[i] ?? spots[0];
    const [x, y] = tile.split(",").map(Number);
    const pick = l.crew[i];
    const t = raceOf(pick.race);
    ship.crew.push({
      id: idx * 100 + i, name: String(pick.name || pickName(NAMES)).slice(0, 16), race: RACES[pick.race] ? pick.race : "human",
      hp: t.hp, maxHp: t.hp, x, y, tile,
      path: [], home: tile, task: "idle", xp: Object.fromEntries(SKILLS.map((s) => [s, 0])) as CrewState["xp"],
      stun: 0, dead: false,
    });
  }
  autoPower(db, ship);
  return ship;
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
    const used = ship.weapons.filter((x) => x.powered).reduce((a, x) => a + (db.weapons[x.bp]?.power ?? 1), 0);
    if (used + need > usable(ws)) continue;
    if (ws.power < used + need) give("weapons", used + need - ws.power);
    if (ws.power >= used + need) w.powered = true;
  }
  give("medbay", 1);
}

export { key };
