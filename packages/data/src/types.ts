/** Typed game data. Everything the sim and client need, independent of where it came from. */

export type WeaponType = "LASER" | "MISSILES" | "BEAM" | "BOMB" | "BURST";

export interface WeaponBP {
  id: string;
  title: string;
  /** FTL's short name for the weapons tray ("Burst Laser II"). */
  short?: string;
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

/** Systems the arena simulates. Others are parsed but not installable yet. */
export const V1_SYSTEMS: SystemId[] = ["shields", "engines", "oxygen", "weapons", "drones", "teleporter", "medbay", "clonebay", "pilot", "sensors", "doors"];

export type DroneType = "COMBAT" | "DEFENSE" | "SHIP_REPAIR" | "REPAIR" | "BATTLE" | "BOARDER" | "HACKING" | "SHIELD";
/** Drone types the arena flies: space drones, plus interior and boarding drones (hacking and the shield drone come later). */
export const SPACE_DRONES: DroneType[] = ["COMBAT", "DEFENSE", "SHIP_REPAIR", "BATTLE", "REPAIR", "BOARDER"];
/** Drones that act as units inside a ship (anti-personnel, system repair, boarding). */
export const UNIT_DRONES: DroneType[] = ["BATTLE", "REPAIR", "BOARDER"];

export interface DroneBP {
  id: string;
  title: string;
  type: DroneType;
  power: number;
  cost: number;
  /** Seconds between shots (defense / anti-drone); combat drones use `speed`. */
  cooldown: number;
  /** FTL's speed field (combat drones: higher = fires more often). */
  speed: number;
  weapon: string;
  image: string;
  /** Store/tray icon: systemUI/weapbox_icon_D_<icon>.png. */
  icon: string;
  rarity: number;
  /** Anti-drone drones target drones instead of projectiles. */
  antiDrone?: boolean;
}

export interface AugmentBP {
  id: string;
  title: string;
  desc: string;
  cost: number;
  value: number;
  stackable: boolean;
  rarity: number;
}
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
  /** Shirt colour (first colour of layer 1), 0xRRGGBB. */
  shirt?: number;
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
  /** Direction the weapon retracts into the hull when unpowered. */
  slide: "up" | "down" | "left" | "right" | "";
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
  /** Hull break-up pieces (<explosion><gibN>): image <img>_gibN.png at hull-image offset x,y. */
  gibs: Gib[];
}

export interface Gib {
  n: number;
  x: number;
  y: number;
  velocity: [number, number];
  /** Degrees. */
  direction: [number, number];
  angular: [number, number];
}

export interface ShipSystemSlot {
  id: SystemId;
  room: number;
  power: number;
  /** Enemy blueprints: the most bars this system can be given. */
  max?: number;
  start: boolean;
  /** Station tile index inside the room (row-major), -1 when the system has no station. */
  station: number;
  /** Which way the crew member at the station faces (towards the computer). */
  facing?: "up" | "down" | "left" | "right";
  /** Interior image name (img/ship/interior/<img>.png). */
  img?: string;
}

export interface ShipBP {
  id: string;
  title: string;
  /** FTL's class line ("Kestrel Cruiser"), plus A/B/C for player layouts. */
  className: string;
  /** Single-player enemy hull: vertical art under img/ships_glow, weapons from a pool. */
  enemy?: boolean;
  /** Folder under img/ holding <img>_base.png and gibs. */
  artDir: "ship" | "ships_glow";
  /** Enemy hulls: weapon blueprint pool and crew cap. */
  weaponPool?: string[];
  crewMax?: number;
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
  /** Starting augments (free). */
  augments: string[];
  droneSlots: number;
  /** Starting drones and drone parts. */
  drones: string[];
  droneParts: number;
  /** One race per starting crew member, in blueprint order. */
  crewRaces: string[];
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
  /** The sheet as it was defined when this anim was declared (FTL reuses sheet names). */
  sheetDef?: AnimSheet;
  frames: number;
  chargedFrame: number;
  fireFrame: number;
  firePoint: { x: number; y: number };
  mountPoint: { x: number; y: number };
}

export interface Anim {
  sheet: string;
  sheetDef?: AnimSheet;
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
  /** Music tracks from sounds.xml: explore/combat files under audio/music/. */
  music: { name: string; explore?: string; combat?: string }[];
  /** Crew name pool (names.xml). */
  names: string[];
  augments: Record<string, AugmentBP>;
  droneBPs: Record<string, DroneBP>;
  /** Single-player enemy hulls the practice bot can fly. */
  enemies: string[];
  /** Base hulls offered in the hangar, in order. */
  hangar: string[];
}
