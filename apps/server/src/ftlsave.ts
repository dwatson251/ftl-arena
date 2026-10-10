/**
 * Reading the player's own FTL run (continue.sav) into a hangar loadout ("Load from FTL").
 *
 * The format isn't published; the field order follows the community FTL Profile Editor's reader (Vhati's
 * SavedGameParser). Everything is a 4-byte little-endian int: bools are 0/1 ints, strings a byte length then
 * the bytes (UTF-8 from format 11, FTL 1.6; windows-1252 before). Formats: 2 (FTL 1.03), 7/8/9 (1.5.x), 11
 * (1.6). Only the player ship is needed, which comes right after the header, so reading stops there. The
 * room and door records in between are sized by the ship's layout (rooms by id, w x h squares; every door,
 * airlocks included).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GameDB, SystemId } from "@ftl/data";
import { hullSystems, MAX_AUGMENTS, RACES, RULES, type Loadout, type SkillId } from "@ftl/sim";

/** The systems in the order the save stores them (formats 7+ add the last four). */
const ORDER: string[] = ["shields", "engines", "oxygen", "weapons", "drones", "medbay", "pilot", "sensors", "doors", "teleporter", "cloaking", "artillery"];
const AE_ORDER = ["battery", "clonebay", "mind", "hacking"];
/** The save's six skills, in its order, as the arena's skill ids. */
const SKILL_ORDER: SkillId[] = ["pilot", "engines", "shields", "weapons", "repair", "combat"];

export interface FtlSaveCrew {
  name: string;
  race: string;
  /** A boarding drone or other non-player crew entry. */
  drone: boolean;
  player: boolean;
  xp: Record<SkillId, number>;
}

export interface FtlSave {
  format: number;
  shipName: string;
  blueprint: string;
  hull: number;
  fuel: number;
  scrap: number;
  missiles: number;
  droneParts: number;
  reactor: number;
  /** Installed level (capacity) per system; absent = not installed. */
  systems: Partial<Record<string, number>>;
  crew: FtlSaveCrew[];
  weapons: string[];
  drones: string[];
  augments: string[];
}

class Reader {
  o = 0;
  constructor(private b: Buffer, private utf8: boolean) {}
  int(): number {
    if (this.o + 4 > this.b.length) throw new Error("the save ends early");
    const v = this.b.readInt32LE(this.o);
    this.o += 4;
    return v;
  }
  bool(): boolean {
    const v = this.int();
    if (v !== 0 && v !== 1) throw new Error(`expected a yes/no at byte ${this.o - 4}, found ${v}`);
    return v === 1;
  }
  str(): string {
    const n = this.int();
    if (n < 0 || n > 4096 || this.o + n > this.b.length) throw new Error(`bad text length ${n} at byte ${this.o - 4}`);
    const s = this.b.toString(this.utf8 ? "utf8" : "latin1", this.o, this.o + n);
    this.o += n;
    return s;
  }
  skip(ints: number): void {
    for (let i = 0; i < ints; i++) this.int();
  }
}

/** Decode the player ship from a continue.sav. Throws (with a reason) when it can't be read. */
export function readFtlSave(buf: Buffer, db: GameDB): FtlSave {
  const peek = buf.length >= 4 ? buf.readInt32LE(0) : -1;
  const r = new Reader(buf, peek >= 11);
  const format = r.int();
  if (![2, 7, 8, 9, 11].includes(format)) throw new Error(`not an FTL save in progress (format ${format})`);
  const ae = format >= 7;
  if (format === 11) r.bool(); // random native
  if (ae) r.bool(); // DLC
  r.int(); // difficulty
  r.skip(4); // ships defeated, beacons, scrap collected, crew hired
  r.str(); // ship name (again below)
  r.str(); // blueprint (again below)
  r.int(); // sector
  r.int(); // always 0
  const vars = r.int();
  if (vars < 0 || vars > 10000) throw new Error("bad state list");
  for (let i = 0; i < vars; i++) {
    r.str();
    r.int();
  }
  // The player ship.
  const blueprint = r.str();
  const shipName = r.str();
  r.str(); // art name
  const bp = db.ships[blueprint];
  const L = bp && db.layouts[bp.layout];
  if (!bp || !L) throw new Error(`the save's ship (${blueprint}) isn't in your FTL data`);
  const starting = r.int();
  for (let i = 0; i < starting; i++) {
    r.str();
    r.str();
  }
  if (ae) {
    r.bool(); // hostile
    r.int(); // jump charge
    r.bool(); // jumping
    r.int(); // jump anim
  }
  const hull = r.int();
  const fuel = r.int();
  const droneParts = r.int();
  const missiles = r.int();
  const scrap = r.int();
  const crew: FtlSaveCrew[] = [];
  const crewCount = r.int();
  if (crewCount < 0 || crewCount > 64) throw new Error("bad crew list");
  for (let i = 0; i < crewCount; i++) {
    const name = r.str();
    const race = r.str();
    const boarding = r.bool();
    r.skip(5); // health, sprite x/y, room, square
    const player = r.bool();
    if (ae) {
      r.skip(2); // clone ready, death order
      const tints = r.int();
      r.skip(Math.max(0, tints));
      r.bool(); // mind controlled
      r.skip(2); // saved square, room
    }
    const xp = Object.fromEntries(SKILL_ORDER.map((s) => [s, r.int()])) as Record<SkillId, number>;
    r.bool(); // male
    r.skip(5); // repairs, kills, evasions, jumps, masteries
    if (ae) {
      r.skip(6); // stun, health boost, clone priority, damage boost, ?, deaths
      if (format >= 8) for (let k = 0; k < 12; k++) r.bool(); // skill masteries
      r.bool(); // ?
      r.bool(); // teleport anim: playing
      r.bool(); // looping
      r.skip(5); // frame, ticks, scale, x, y
      r.bool(); // ?
      if (race === "crystal") r.skip(3); // lockdown recharge
    }
    crew.push({ name, race, drone: boarding || !!RACES[race]?.drone, player, xp });
  }
  // Systems: reserve power (the reactor), then each in the save's order; multi-room systems repeat.
  const reactor = r.int();
  const systems: Partial<Record<string, number>> = {};
  const rooms = (id: string) => Math.max(1, bp.systems.filter((s) => s.id === id || (id === "artillery" && s.id.startsWith("artillery"))).length);
  for (const id of ae ? [...ORDER, ...AE_ORDER] : ORDER) {
    for (let k = 0; k < rooms(id); k++) {
      const cap = r.int();
      if (cap > 0) {
        if (k === 0) systems[id] = cap;
        r.skip(6);
        if (ae) {
          r.skip(2);
          r.bool(); // hacked
          r.skip(3);
        }
      }
    }
  }
  if (ae) {
    if ((systems.clonebay ?? 0) > 0) r.skip(3);
    if ((systems.battery ?? 0) > 0) {
      r.bool();
      r.skip(2);
    }
    // Shields info is always there: 4 ints, then three (on, ticks) anim pairs, then 2 ints.
    r.skip(4);
    for (let k = 0; k < 3; k++) {
      r.bool();
      r.int();
    }
    r.skip(2);
    if ((systems.cloaking ?? 0) > 0) r.skip(4);
  }
  // Rooms by id: O2, three ints per square, then the station (formats 7+).
  for (const room of [...L.rooms].sort((a, b) => a.id - b.id)) {
    const o2 = r.int();
    if (o2 < 0 || o2 > 100) throw new Error(`room ${room.id} O2 reads as ${o2}: the save doesn't match this ship's layout`);
    r.skip(room.w * room.h * 3);
    if (ae) r.skip(2);
  }
  const breaches = r.int();
  if (breaches < 0 || breaches > 500) throw new Error("bad breach list");
  r.skip(breaches * 3);
  for (let d = 0; d < L.doors.length; d++) {
    if (ae) r.skip(3);
    r.bool();
    r.bool();
    if (ae) r.skip(2);
  }
  if (ae) r.int(); // cloak anim
  if (format >= 8) {
    const crystals = r.int();
    if (crystals < 0 || crystals > 100) throw new Error("bad lockdown list");
    for (let k = 0; k < crystals; k++) {
      r.skip(5);
      r.bool();
      r.bool();
      r.int();
      r.bool();
      r.skip(3);
    }
  }
  const weapons: string[] = [];
  const wn = r.int();
  if (wn < 0 || wn > 16) throw new Error("bad weapon list");
  for (let k = 0; k < wn; k++) {
    weapons.push(r.str());
    r.bool();
    if (format === 2) r.int();
  }
  const drones: string[] = [];
  const dn = r.int();
  if (dn < 0 || dn > 16) throw new Error("bad drone list");
  for (let k = 0; k < dn; k++) {
    drones.push(r.str());
    r.bool();
    r.bool();
    r.skip(5);
  }
  const augments: string[] = [];
  const an = r.int();
  if (an < 0 || an > 16) throw new Error("bad augment list");
  for (let k = 0; k < an; k++) augments.push(r.str());
  return { format, shipName, blueprint, hull, fuel, scrap, missiles, droneParts, reactor, systems, crew, weapons, drones, augments };
}

/** The save as a hangar loadout, best effort, with notes on what didn't come across. */
export function ftlSaveToLoadout(save: FtlSave, db: GameDB): { loadout: Loadout; notes: string[] } {
  const ship = db.ships[save.blueprint];
  if (!ship || !db.hangar.includes(save.blueprint)) throw new Error(`${save.blueprint} isn't a player ship the arena offers`);
  const notes: string[] = ["Scrap, fuel, hull damage and cargo stay in FTL."];
  const dropped: string[] = [];
  const systems: Partial<Record<SystemId, number>> = {};
  const hs = hullSystems(db, save.blueprint);
  for (const h of hs) {
    const cap = save.systems[h.id] ?? 0;
    systems[h.id] = Math.min(cap, h.max);
    if (cap > h.max) notes.push(`${h.id} capped at level ${h.max} (FTL had ${cap}).`);
  }
  for (const id of Object.keys(save.systems)) if (id !== "artillery" && !hs.some((h) => h.id === id)) dropped.push(`${id} system (no room for it in the arena's version of this hull)`);
  const keep = (ids: string[], ok: (id: string) => boolean, cap: number, what: string): string[] => {
    const out: string[] = [];
    for (const id of ids) {
      if (!ok(id)) dropped.push(`${what} ${id}`);
      else if (out.length >= cap) dropped.push(`${what} ${id} (no free slot)`);
      else out.push(id);
    }
    return out;
  };
  const weapons = keep(save.weapons, (id) => !!db.weapons[id], ship.weaponSlots, "weapon");
  const drones = keep(save.drones, (id) => !!db.droneBPs?.[id], ship.droneSlots ?? 0, "drone");
  const augments = keep(save.augments, (id) => !!db.augments?.[id], MAX_AUGMENTS, "augment");
  const people = save.crew.filter((c) => c.player && !c.drone && RACES[c.race] && !RACES[c.race].drone && db.crew[c.race]);
  const crew = people.slice(0, RULES.maxCrew).map((c) => ({
    name: c.name.slice(0, 16),
    race: c.race,
    xp: Object.fromEntries(Object.entries(c.xp).map(([k, v]) => [k, Math.max(0, Math.min(RULES.skillXp[k as SkillId][1], v | 0))])) as Partial<Record<SkillId, number>>,
  }));
  if (people.length > RULES.maxCrew) notes.push(`${people.length - RULES.maxCrew} crew over the arena's limit of ${RULES.maxCrew} stayed behind.`);
  if (dropped.length) notes.push(`Not carried over: ${dropped.join(", ")}.`);
  return {
    loadout: { origin: "ftl", ship: save.blueprint, systems, reactor: save.reactor, weapons, crew, missiles: Math.max(0, save.missiles), augments, drones, droneParts: Math.max(0, save.droneParts) },
    notes,
  };
}

/** Where FTL keeps its save in progress on this machine (null if there's none). */
export function findFtlSave(env: NodeJS.ProcessEnv = process.env): string | null {
  const file = (dir: string) => join(dir, "continue.sav");
  const dirs: string[] = [];
  if (env.FTL_SAVE) dirs.push(env.FTL_SAVE.endsWith(".sav") ? env.FTL_SAVE.replace(/[\\/]continue\.sav$/i, "") : env.FTL_SAVE);
  const home = homedir();
  const docs = ["Documents", "My Documents"];
  for (const d of docs) dirs.push(join(env.USERPROFILE ?? home, d, "My Games", "FasterThanLight"));
  if (env.OneDrive) dirs.push(join(env.OneDrive, "Documents", "My Games", "FasterThanLight"));
  dirs.push(join(home, "Library", "Application Support", "FasterThanLight"));
  dirs.push(join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), "FasterThanLight"));
  // Developing in WSL: the Windows side's documents.
  try {
    for (const u of readdirSync("/mnt/c/Users")) dirs.push(join("/mnt/c/Users", u, "Documents", "My Games", "FasterThanLight"));
  } catch {}
  if (env.FTL_SAVE?.endsWith(".sav")) return existsSync(env.FTL_SAVE) ? env.FTL_SAVE : null;
  if (env.FTL_SAVE) return existsSync(file(env.FTL_SAVE)) ? file(env.FTL_SAVE) : null;
  for (const d of dirs) if (existsSync(file(d))) return file(d);
  return null;
}

export interface FtlImport {
  ok: boolean;
  reason?: string;
  loadout?: Loadout;
  notes?: string[];
  shipName?: string;
  title?: string;
  className?: string;
  savedAt?: number;
}

/** The whole "Load from FTL" lookup: find the save, read it, map it. Never throws. */
export function importFtlSave(db: GameDB, env: NodeJS.ProcessEnv = process.env): FtlImport {
  const f = findFtlSave(env);
  if (!f) return { ok: false, reason: "no FTL save in progress found" };
  try {
    const save = readFtlSave(readFileSync(f), db);
    const { loadout, notes } = ftlSaveToLoadout(save, db);
    const bp = db.ships[save.blueprint];
    return { ok: true, loadout, notes, shipName: save.shipName, title: bp.title, className: bp.className, savedAt: statSync(f).mtimeMs };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
