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

export function buildDb(pres: Presentation | null = null): GameDB {
  const text = pres?.text ?? {};
  const say = (id: string | undefined) => (id ? text[id] : undefined);
  const db: GameDB = {
    source: pres ? "ftl" : "placeholder",
    weapons: {}, systems: {}, crew: {}, ships: {}, layouts: {}, augments: {}, droneBPs: {},
    animSheets: pres?.animSheets ?? {}, weaponAnims: pres?.weaponAnims ?? {}, anims: pres?.anims ?? {},
    sounds: pres?.sounds ?? {}, music: pres?.music ?? [], names: pres?.names.length ? pres.names : FALLBACK_NAMES,
    hangar: [...HANGAR], enemies: [...ENEMIES],
  };
  if (pres) db.femaleNames = pres.femaleNames;
  if (say("reactor_desc")) db.reactorDesc = say("reactor_desc");
  for (const w of WEAPONS) db.weapons[w.id] = plain(w);
  for (const d of DRONES) db.droneBPs[d.id] = plain(d);
  for (const c of CREW) db.crew[c.id] = plain(c, ["traits"]) as CrewBP;
  for (const a of AUGMENTS) {
    const t = (a as unknown as { text?: { desc?: string } }).text;
    db.augments[a.id] = { ...(plain(a, ["effect", "text"]) as Omit<AugmentBP, "desc">), desc: (pres ? say(t?.desc) : undefined) ?? (pres ? "" : a.effect) };
  }
  for (const s of SYSTEMS) {
    const t = (s as unknown as { text?: { title?: string; desc?: string } }).text;
    const bp = plain(s, ["text", "title", "desc"]) as SystemBP;
    const pick = LEVEL_TEXT[s.id];
    const levels = Array.from({ length: s.maxPower }, (_, i) => {
      const k = pick?.(i + 1);
      return (k && text[k]) || "";
    });
    const word = (id: string | undefined, own: string | undefined) => (id ? (text[id] ?? (pres ? id : undefined)) : own);
    db.systems[s.id] = { ...bp, title: word(t?.title, s.title), desc: word(t?.desc, s.desc), levels: levels.some(Boolean) ? levels : undefined };
  }
  for (const s of SHIPS) {
    db.ships[s.id] = shipBlueprint(s);
    db.layouts[s.layout.id] ??= structuredClone(s.layout);
  }
  return db;
}
