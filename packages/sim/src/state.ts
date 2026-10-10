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
  /** A hacking drone is attached: the owner can't change this system's power (recomputed every tick). */
  locked?: boolean;
  /** A hacking pulse is running on this system (recomputed every tick). */
  hacked?: boolean;
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

export type CrewTask = "idle" | "walk" | "man" | "repair" | "fire" | "breach" | "heal" | "fight" | "sabotage";

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
  /** Sensed only (telepathy / life scanner): a location with no race, health or action. */
  blip?: boolean;
  /** Which player this crew member belongs to (ships hold whoever is aboard, boarders included). */
  owner: 0 | 1;
  /** Drone units: the owner's drone slot that launched it. */
  drone?: number;
  /** Seconds of door-bashing / sabotage progress (boarders). */
  bash?: number;
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
  drones?: DroneState[];
  droneParts?: number;
  /** Teleporter charge in seconds (ready at RULES.teleCooldown[level]). */
  tele?: number;
  /** Cloaking: seconds of cloak left, and recharge left after it. */
  cloak?: { t: number; cd: number };
  /** This ship's hacking drone: in flight (attached false) or on an enemy room; pulse and recharge timers. */
  hack?: { room: number; attached: boolean; pulse: number; cd: number };
  /** Stats for the end screen. */
  stats: { shotsFired: number; hits: number; misses: number; blocked: number; damageDealt: number };
}

export interface DroneState {
  slot: number;
  bp: string;
  /** Powered drones deploy (using a drone part); unpowering loses the deployed drone. */
  powered: boolean;
  deployed: boolean;
  /** Orbit angle (radians) for drawing. */
  angle: number;
  /** Seconds until the next shot/repair. */
  cd: number;
  /** Ship repair drones: hull points left before it expires. */
  repairLeft?: number;
}

export interface Projectile {
  id: number;
  /** Fired by drone slot n (drawn from the drone, not a weapon mount). */
  drone?: number;
  from: 0 | 1;
  weapon: string;
  slot: number;
  /** BOARDER: a boarding drone in flight (`boarder` = the owner's drone slot). */
  kind: "LASER" | "MISSILES" | "BURST" | "BOMB" | "BEAM" | "BOARDER" | "HACK";
  boarder?: number;
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
  /** A defense drone shot down a projectile (ship = the defender) / an anti-drone killed a drone. */
  | { e: "intercept"; ship: 0 | 1; projectile: number; drone: number }
  | { e: "droneLost"; ship: 0 | 1; drone: number }
  /** Crew teleported by `ship`'s teleporter: out to the enemy (out) or back home. */
  | { e: "teleport"; ship: 0 | 1; crew: number[]; out: boolean; room: number }
  | { e: "doorBroken"; ship: 0 | 1; door: number }
  | { e: "cloak"; ship: 0 | 1; on: boolean }
  /** `ship`'s hacking drone landed on / started a pulse on the enemy `room`. */
  | { e: "hackLand"; ship: 0 | 1; room: number }
  | { e: "hackPulse"; ship: 0 | 1; room: number }
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
