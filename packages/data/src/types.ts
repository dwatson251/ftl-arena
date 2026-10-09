/** Typed game data. Everything the sim and client need, independent of where it came from. */

export type WeaponType = "LASER" | "MISSILES" | "BEAM" | "BOMB" | "BURST";

export interface WeaponBP {
  id: string;
  title: string;
  type: WeaponType;
  damage: number;
  shots: number;
  /** Shield piercing: shield layers this projectile ignores. */
  sp: number;
  /** Chances are in tenths (FTL's 1 = 10%). */
  fireChance: number;
  breachChance: number;
  stunChance: number;
  ion: number;
  sysDamage: number;
  persDamage: number;
  hullBust: boolean;
  /** Seconds to charge. */
  cooldown: number;
  power: number;
  cost: number;
  /** Missiles consumed per volley (missiles and bombs). */
  missiles: number;
  /** Beam length in pixels. */
  length: number;
  /** Flak spread radius in pixels. */
  radius: number;
  /** Projectile speed, FTL units (missing = type default). */
  speed: number;
  /** Seconds of stun (stun bombs etc.). */
  stun: number;
  /** Projectile anim name and the weapon's mount anim name (for the client). */
  image: string;
  weaponArt: string;
  /** Store availability: rarity 0 means never sold in stores. */
  rarity: number;
  /** Charge weapons (Flak/Ion charge-ups): volleys stored before firing. 1 for normal weapons. */
  chargeLevels: number;
  /** Chain weapons: each volley adds `amount` (cooldown seconds or damage), up to `count` times. */
  boost?: { type: "cooldown" | "damage"; amount: number; count: number };
  /** Sound names (keys of GameDB.sounds) per event. */
  sounds?: { launch: string[]; hit: string[]; shield: string[]; miss: string[] };
}

export type SystemId =
  | "shields" | "engines" | "oxygen" | "weapons" | "medbay" | "pilot" | "sensors" | "doors"
  | "drones" | "teleporter" | "cloaking" | "battery" | "mind" | "hacking" | "clonebay" | "artillery";

/** Systems the v1 arena simulates. Others are parsed but not installable yet. */
export const V1_SYSTEMS: SystemId[] = ["shields", "engines", "oxygen", "weapons", "medbay", "pilot", "sensors", "doors"];
/** AE subsystems: their power comes from their own level, not the reactor. */
export const SUBSYSTEMS: SystemId[] = ["pilot", "sensors", "doors", "battery"];

export interface SystemBP {
  id: SystemId;
  maxPower: number;
  startPower: number;
  /** upgradeCost[i] is the scrap price of going from level i+1 to i+2. */
  upgradeCost: number[];
  /** Price to install from a store. */
  cost: number;
}

export interface CrewBP {
  id: string;
  title: string;
  cost: number;
}

export interface Room {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Door {
  x: number;
  y: number;
  /** Room ids; -1 is space (an airlock). */
  a: number;
  b: number;
  /** True when the door sits on a vertical wall (between left and right tiles). */
  vertical: boolean;
}

export interface WeaponMount {
  x: number;
  y: number;
  rotate: boolean;
  mirror: boolean;
}

export interface ShipLayout {
  id: string;
  xOffset: number;
  yOffset: number;
  rooms: Room[];
  doors: Door[];
  /** Hull image rectangle relative to the room grid's origin (pixels). */
  img: { x: number; y: number; w: number; h: number };
  floor: { x: number; y: number };
  mounts: WeaponMount[];
  /** Shield ellipse: centre offset and radii. */
  ellipse: { a: number; b: number; x: number; y: number };
}

export interface ShipSystemSlot {
  id: SystemId;
  room: number;
  power: number;
  start: boolean;
  /** Station tile index inside the room (row-major), -1 when the system has no station. */
  station: number;
  /** Interior image name (img/ship/interior/<img>.png). */
  img?: string;
}

export interface ShipBP {
  id: string;
  title: string;
  layout: string;
  img: string;
  systems: ShipSystemSlot[];
  weaponSlots: number;
  weapons: string[];
  missiles: number;
  health: number;
  maxPower: number;
  crewCount: number;
  crewRace: string;
}

export interface AnimSheet {
  file: string;
  w: number;
  h: number;
  fw: number;
  fh: number;
}

export interface WeaponAnim {
  sheet: string;
  frames: number;
  chargedFrame: number;
  fireFrame: number;
  firePoint: { x: number; y: number };
  mountPoint: { x: number; y: number };
}

export interface Anim {
  sheet: string;
  frames: number;
  x: number;
  y: number;
  time: number;
}

export interface GameDB {
  /** "ftl" when built from the owner's ftl.dat, "placeholder" for the committed demo set. */
  source: "ftl" | "placeholder";
  weapons: Record<string, WeaponBP>;
  systems: Record<string, SystemBP>;
  crew: Record<string, CrewBP>;
  ships: Record<string, ShipBP>;
  layouts: Record<string, ShipLayout>;
  animSheets: Record<string, AnimSheet>;
  weaponAnims: Record<string, WeaponAnim>;
  anims: Record<string, Anim>;
  /** Sound name -> file under audio/waves/ and volume (0-10ish). */
  sounds: Record<string, { file: string; volume: number }>;
  /** Base hulls offered in the hangar, in order. */
  hangar: string[];
}
