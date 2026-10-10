/** Serialisable match state. Plain JSON: the server snapshots it, the bench hashes it. */
import type { SystemId } from "@ftl/data";
import type { SkillId } from "./rules.ts";

export type WinCondition = "hull" | "crew";

export interface MatchConfig {
  winCondition: WinCondition;
  /** Scrap each player may spend in the hangar. */
  scrap: number;
  /** Hulls players may pick; empty = every hangar ship. */
  shipPool: string[];
  /** Seconds before the match is called a draw by hull %; 0 = no limit. */
  timeLimit: number;
  seed: number;
  /** "For fun": system levels up to 20 and reactor up to 60 in the hangar. */
  unlimited?: boolean;
}

export const DEFAULT_CONFIG: MatchConfig = { winCondition: "hull", scrap: 400, shipPool: [], timeLimit: 0, seed: 1 };

export interface SystemState {
  id: SystemId;
  room: number;
  /** Installed level (bars). */
  level: number;
  /** Reactor power allocated (main systems) - always clamped to usable(). */
  power: number;
  damage: number;
  repair: number;
  /** Ion stacks lock bars; `ionTimer` counts down the current stack. */
  ion: number;
  ionTimer: number;
  /** Station tile key inside the room, "" when unmanned-type. */
  station: string;
  /** Fractional fire damage accumulator. */
  fireDmg: number;
  /** Free power from Zoltan crew standing in the room (recomputed every tick). */
  bonus: number;
  /** Subsystems (sensors, doors) work one level higher while manned (recomputed every tick). */
  manBonus?: number;
  /** Direction a crew member at the station faces. */
  facing?: "up" | "down" | "left" | "right";
}

export interface RoomState {
  id: number;
  o2: number;
  /** tile key -> fire HP */
  fires: Record<string, number>;
  /** tile key -> breach HP */
  breaches: Record<string, number>;
}

export type CrewTask = "idle" | "walk" | "man" | "repair" | "fire" | "breach" | "heal";

export interface CrewState {
  id: number;
  name: string;
  race: string;
  hp: number;
  maxHp: number;
  /** Position in tile units (centre of tile x is x + 0.5). */
  x: number;
  y: number;
  /** Tile the crew is standing on / heading to. */
  tile: string;
  path: string[];
  /** Destination tile chosen by the player (crew return to it). */
  home: string;
  task: CrewTask;
  xp: Record<SkillId, number>;
  stun: number;
  dead: boolean;
  /** Seconds left of the death animation; the crew member only counts as dead once it ends. */
  dying?: number;
  /** Clone bay progress 0..1 while this dead crew member is being cloned. */
  clone?: number;
}

export type WeaponTarget =
  | { kind: "room"; room: number }
  | { kind: "beam"; x1: number; y1: number; x2: number; y2: number };

export interface WeaponState {
  slot: number;
  bp: string;
  powered: boolean;
  charge: number;
  /** Volleys stored (charge weapons store up to chargeLevels). */
  volleys: number;
  target: WeaponTarget | null;
  autofire: boolean;
  /** Chain weapons: boosts gained. */
  boost: number;
  /** Current charge ceiling in seconds: the blueprint cooldown lowered by manning and chain boosts. */
  cd?: number;
}

export interface ShipState {
  idx: 0 | 1;
  player: string;
  bp: string;
  layout: string;
  hull: number;
  maxHull: number;
  reactor: number;
  systems: Partial<Record<SystemId, SystemState>>;
  rooms: RoomState[];
  doors: boolean[];
  crew: CrewState[];
  weapons: WeaponState[];
  missiles: number;
  shieldLayers: number;
  shieldCharge: number;
  /** Zoltan Shield points (augment); absorbs everything until gone. */
  superShield?: number;
  evasion: number;
  /** Augment ids (stackable ones may repeat). */
  augments?: string[];
  /** Stats for the end screen. */
  stats: { shotsFired: number; hits: number; misses: number; blocked: number; damageDealt: number };
}

export interface Projectile {
  id: number;
  from: 0 | 1;
  weapon: string;
  slot: number;
  kind: "LASER" | "MISSILES" | "BURST" | "BOMB" | "BEAM";
  /** Seconds until launch (shots in a volley are staggered), then flight time remaining. */
  delay: number;
  t: number;
  flight: number;
  target: WeaponTarget;
  /** Flak: exact landing point in target grid pixels. */
  px: number;
  py: number;
  damageBonus: number;
}

export type MatchEvent =
  | { e: "fire"; ship: 0 | 1; slot: number }
  | { e: "miss"; ship: 0 | 1; px: number; py: number }
  | { e: "shield"; ship: 0 | 1; px: number; py: number }
  | { e: "hit"; ship: 0 | 1; room: number; damage: number; px: number; py: number }
  | { e: "beam"; ship: 0 | 1; x1: number; y1: number; x2: number; y2: number; blocked: boolean }
  | { e: "fireStart" | "breach"; ship: 0 | 1; room: number }
  | { e: "death"; ship: 0 | 1; crew: number }
  | { e: "clone"; ship: 0 | 1; crew: number }
  | { e: "end"; winner: 0 | 1 | -1; reason: string };

export interface MatchState {
  tick: number;
  rng: number;
  nextId: number;
  config: MatchConfig;
  ships: [ShipState, ShipState];
  projectiles: Projectile[];
  /** Events produced during the latest step only. */
  events: MatchEvent[];
  winner: 0 | 1 | -1 | null;
  endReason: string;
}
