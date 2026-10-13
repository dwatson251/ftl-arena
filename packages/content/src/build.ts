/** The GameDB the sim and client use, built from the content classes plus the player's install (if any). */
import { type AugmentBP, type CrewBP, type GameDB, type Presentation, type ShipBP, type SystemBP } from "@ftl/data";
import { AUGMENTS, CREW, DRONES, ENEMIES, HANGAR, SHIPS, SYSTEMS, WEAPONS } from "./registry.ts";
import { FEMALE_NAMES, NAMES } from "./names.ts";
import { REACTOR_DESC } from "./text.ts";
import type { ShipConfig } from "./types.ts";


const plain = <T>(o: T, drop: string[] = []): T => Object.fromEntries(Object.entries(o as object).filter(([k, v]) => !drop.includes(k) && v !== undefined)) as T;

export function shipBlueprint(s: ShipConfig): ShipBP {
  const L = s.loadout;
  const bp: ShipBP = {
    id: s.id, title: s.title, className: s.className, artDir: s.sprites.dir, layout: s.layout.id, img: s.sprites.img,
    systems: s.systems.map((x) => ({ ...x })), weaponSlots: s.weaponSlots, weapons: [...L.weapons], missiles: L.missiles, health: s.health,
    maxPower: s.reactor, crewCount: L.crewCount, crewRace: L.crewRace, augments: [...L.augments], droneSlots: s.droneSlots,
    drones: [...L.drones], droneParts: L.droneParts, crewRaces: [...L.crew],
  };
  if (s.sprites.floor) bp.floorImg = s.sprites.floor;
  if (s.sprites.shield) bp.shieldImg = s.sprites.shield;
  if (s.sprites.cloak) bp.cloakImg = s.sprites.cloak;
  if (s.enemy.scale !== 1) bp.viewScale = s.enemy.scale;
  if (s.enemy.shieldNudge) bp.shieldNudge = { ...s.enemy.shieldNudge };
  if (s.enemy.single) bp.enemy = true;
  if (s.enemy.auto) bp.auto = true;
  if (s.enemy.weaponPool) bp.weaponPool = [...s.enemy.weaponPool];
  if (s.enemy.crewMax !== undefined) bp.crewMax = s.enemy.crewMax;
  return bp;
}

/**
 * The game's data: everything a match needs, from the content classes alone, FTL's words included. This is
 * what a server sends; nothing in it depends on FTL being installed. `pres` (the player's own install's art
 * metadata and sounds) is laid over it for display.
 */
export function buildDb(pres: Presentation | null = null): GameDB {
  const db: GameDB = {
    source: "placeholder",
    weapons: {}, systems: {}, crew: {}, ships: {}, layouts: {}, augments: {}, droneBPs: {},
    animSheets: {}, weaponAnims: {}, anims: {}, sounds: {}, music: [], names: [...NAMES], femaleNames: [...FEMALE_NAMES],
    hangar: [...HANGAR], enemies: [...ENEMIES],
  };
  if (REACTOR_DESC) db.reactorDesc = REACTOR_DESC;
  for (const w of WEAPONS) db.weapons[w.id] = plain(w);
  for (const d of DRONES) db.droneBPs[d.id] = plain(d);
  for (const c of CREW) db.crew[c.id] = plain(c, ["traits"]) as CrewBP;
  for (const a of AUGMENTS) db.augments[a.id] = plain(a, ["effect"]) as AugmentBP;
  for (const s of SYSTEMS) {
    const bp = plain(s, ["title", "desc", "levels"]) as SystemBP;
    db.systems[s.id] = { ...bp, title: s.title || undefined, desc: s.desc || undefined, levels: s.levels.some(Boolean) ? [...s.levels] : undefined };
  }
  for (const s of SHIPS) {
    db.ships[s.id] = shipBlueprint(s);
    db.layouts[s.layout.id] ??= structuredClone(s.layout);
  }
  return pres ? applyPresentation(db, pres) : db;
}

/**
 * Lays a player's own install over the game's data, for display only: FTL's animation sheets (how its art is
 * cut into frames), its sound names and music. A client does this with the data a server sent, so the server
 * never needs (or sends) any of it.
 */
export function applyPresentation(db: GameDB, pres: Presentation): GameDB {
  db.source = "ftl";
  db.animSheets = pres.animSheets;
  db.weaponAnims = pres.weaponAnims;
  db.anims = pres.anims;
  db.sounds = pres.sounds;
  db.music = pres.music;
  return db;
}
