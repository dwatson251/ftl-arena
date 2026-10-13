/** The GameDB the sim and client use, built from the content classes plus the player's install (if any). */
import { LEVEL_TEXT, type AugmentBP, type CrewBP, type GameDB, type Presentation, type ShipBP, type SystemBP } from "@ftl/data";
import { AUGMENTS, CREW, DRONES, ENEMIES, HANGAR, SHIPS, SYSTEMS, WEAPONS } from "./registry.ts";
import type { ShipConfig } from "./types.ts";

/** Crew names when there's no install to take FTL's list from. */
const FALLBACK_NAMES = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Taylor", "Quinn", "Avery", "Rowan", "Skyler", "Reese", "Harper", "Emery", "Jules", "Kai"];

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
 * The game's data: everything a match needs, from the content classes alone. This is what a server sends;
 * nothing in it depends on FTL being installed. `pres` (the player's own install) is laid over it for display.
 */
export function buildDb(pres: Presentation | null = null): GameDB {
  const db: GameDB = {
    source: "placeholder",
    weapons: {}, systems: {}, crew: {}, ships: {}, layouts: {}, augments: {}, droneBPs: {},
    animSheets: {}, weaponAnims: {}, anims: {}, sounds: {}, music: [], names: FALLBACK_NAMES,
    hangar: [...HANGAR], enemies: [...ENEMIES],
  };
  for (const w of WEAPONS) db.weapons[w.id] = plain(w);
  for (const d of DRONES) db.droneBPs[d.id] = plain(d);
  for (const c of CREW) db.crew[c.id] = plain(c, ["traits"]) as CrewBP;
  // Without FTL's words an augment describes itself by what it does in the arena.
  for (const a of AUGMENTS) db.augments[a.id] = { ...(plain(a, ["effect", "text"]) as Omit<AugmentBP, "desc">), desc: a.effect };
  for (const s of SYSTEMS) {
    const bp = plain(s, ["text", "title", "desc"]) as SystemBP;
    db.systems[s.id] = { ...bp, title: s.title, desc: s.desc, levels: undefined };
  }
  for (const s of SHIPS) {
    db.ships[s.id] = shipBlueprint(s);
    db.layouts[s.layout.id] ??= structuredClone(s.layout);
  }
  return pres ? applyPresentation(db, pres) : db;
}

/**
 * Lays a player's own install over the game's data, for display only: FTL's animation sheets, sounds, music,
 * crew names and words (titles, descriptions, level lines, looked up by the content classes' text ids). A
 * client does this with the data a server sent, so the server never needs (or sends) any of it.
 */
export function applyPresentation(db: GameDB, pres: Presentation): GameDB {
  const text = pres.text;
  const say = (id: string | undefined) => (id ? text[id] : undefined);
  db.source = "ftl";
  db.animSheets = pres.animSheets;
  db.weaponAnims = pres.weaponAnims;
  db.anims = pres.anims;
  db.sounds = pres.sounds;
  db.music = pres.music;
  if (pres.names.length) db.names = pres.names;
  db.femaleNames = pres.femaleNames;
  if (say("reactor_desc")) db.reactorDesc = say("reactor_desc");
  for (const a of AUGMENTS) {
    const bp = db.augments[a.id];
    const t = (a as unknown as { text?: { desc?: string } }).text;
    if (bp) bp.desc = say(t?.desc) ?? "";
  }
  for (const s of SYSTEMS) {
    const bp = db.systems[s.id];
    if (!bp) continue;
    const t = (s as unknown as { text?: { title?: string; desc?: string } }).text;
    const pick = LEVEL_TEXT[s.id];
    const levels = Array.from({ length: s.maxPower }, (_, i) => {
      const k = pick?.(i + 1);
      return (k && text[k]) || "";
    });
    const word = (id: string | undefined, own: string | undefined) => (id ? (text[id] ?? id) : own);
    bp.title = word(t?.title, s.title);
    bp.desc = word(t?.desc, s.desc);
    bp.levels = levels.some(Boolean) ? levels : undefined;
  }
  return db;
}
