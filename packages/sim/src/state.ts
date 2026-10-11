/** Serialisable match state. Plain JSON: the server snapshots it, the bench hashes it. */
import type { SystemId } from "@ftl/data";
import type { SkillId } from "./rules.ts";

/**
 * "hull": destroy the ship (a ship whose crew are all dead also loses, as in FTL). "auto": autonomous ships, like
 * FTL's drone ships and the flagship once its crew are dead: with no crew aboard a ship runs itself (systems
 * repair on their own, the helm flies itself) and only destroying it wins.
 */
export type WinCondition = "hull" | "auto";

export interface MatchConfig {
  winCondition: WinCondition;
  /** Scrap each player may spend in the hangar. */
  scrap: number;
  /** Hulls players may pick; empty = every hangar ship. */
  shipPool: string[];
  /** Seconds before the match is called a draw by hull %; 0 = no limit. */
  timeLimit: number;
  seed: number;
  /** Unrestricted hangar: weapons, drones and reactor up to the most the hull could ever use (loadout.ts). */
  unlimited?: boolean;
  /**
   * "Bring your own ship": every captain flies the ship from their own FTL run (Load from FTL, or a preset
   * saved from one, unchanged). The hangar's building steps are off and the scrap allowance doesn't apply.
   */
  ftlOnly?: boolean;
  /**
   * Survival (practice only): one stock ship, battle after random battle; the ship carries over and each win
   * offers reward cards (survival.ts). Each battle itself plays as "hull".
   */
  survival?: boolean;
  /**
   * Pausing (experimental; FTL's single player pauses at will). "off": never. "tactical": every `tacticalEvery`
   * seconds of play both players get a forced `tacticalLength` s timeout (it ends early once both are ready).
   * "clock": either player may pause everyone, spending their own `pauseBank` seconds (0 = unlimited, practice
   * only), regaining `pauseRegen` seconds per minute of play.
   */
  pause?: PauseMode;
  hazard?: HazardKind | "random";
  tacticalEvery?: number;
  tacticalLength?: number;
  pauseBank?: number;
  pauseRegen?: number;
}

export type PauseMode = "off" | "tactical" | "clock";

/**
 * FTL's environmental hazards, on both ships alike: a red giant's solar flares, a pulsar's ion pulses, an
 * asteroid field, a nebula (sensors down), an ion (plasma) storm (nebula, and reactors at half), or the
 * Rebels' anti-ship batteries (taking turns at each ship). "random" picks one of the first five.
 */
export type HazardKind = "none" | "sun" | "pulsar" | "asteroids" | "nebula" | "storm" | "asb";

export const DEFAULT_CONFIG: MatchConfig = { winCondition: "hull", scrap: 400, shipPool: [], timeLimit: 0, seed: 1 };

export interface SystemState {
  id: SystemId;
  room: number;
  /** Installed level (bars). */
  level: number;
  /** Reactor power allocated (main systems) - always clamped to usable(). */
  power: number;
  /** The power the player last chose: damage, ion or a shortage take bars away, and they come back by themselves. */
  want?: number;
  damage: number;
  repair: number;
  /** Boarders' progress (0..1) toward breaking the next bar, for the HUD (recomputed every tick). */
  sabotage?: number;
  /** That progress itself: kept while any boarder is in the room, paused while they fight, lost when they all leave. */
  wreck?: number;
  /** Survival: reinforcement stacks; each gives every bar 10% more health (see Match.toughness). */
  reinforced?: number;
  /** Damage soaked by reinforcement, carried toward the next whole bar. */
  armour?: number;
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
  /** Artillery: the weapon it fires and its charge (seconds). */
  weapon?: string;
  charge?: number;
  /** Subsystems (sensors, doors) work one level higher while manned (recomputed every tick). */
  manBonus?: number;
  /** Direction a crew member at the station faces. */
  facing?: "up" | "down" | "left" | "right";
  /** Medbay / clone bay: the tile its equipment stands on (crew can't be sent there). */
  blocked?: string;
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
  /** Being healed by a working medbay this tick (drives the healing crosses and sound). */
  healing?: boolean;
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
  /** How a sensed crew member is drawn (RULES.senseStyle): a dot, or a silhouette with race and action. */
  sense?: "dot" | "silhouette";
  /** Which player this crew member belongs to (ships hold whoever is aboard, boarders included). */
  owner: 0 | 1;
  /** Drone units: the owner's drone slot that launched it. */
  drone?: number;
  /** Seconds of door-bashing progress (boarders; the wrecking progress is the system's, `SystemState.wreck`). */
  bash?: number;
  /**
   * The current attack, as FTL runs it: a foe picked when each 1-1.3 s swing starts (whoever shares the tile,
   * else anyone in the room), the swing's length and time left, whether it's a punch (same tile) or a shot,
   * the way they face (grid space), and whether this swing's damage has landed (half-way through).
   */
  foe?: number;
  atk?: number;
  atkDur?: number;
  punch?: boolean;
  hit?: boolean;
  face?: "up" | "down" | "left" | "right";
  /** Tick they died (the clone bay works through its queue in that order). */
  diedAt?: number;
  /** Seconds left of the clone bay's materialise animation; can't act meanwhile. */
  spawn?: number;
  /** Teleporting: beaming out (then moved to `ship`/`tile`) or beaming in; can't act meanwhile. */
  beam?: { t: number; phase: "out" | "in"; ship: 0 | 1; tile: string };
  /** What they're attacking (tile coords): a foe or a door. The renderer shoots at range, punches up close. */
  aim?: [number, number];
  /** Mind controlled: by which player, seconds left, the true owner, the damage boost and the max HP before. */
  mind?: { by: 0 | 1; t: number; owner: 0 | 1; boost: number; maxHp: number };
  /** Survival: a boarder left aboard when its own ship was destroyed. No teleporter can take it home, so it
   *  never retreats; it fights on for the next enemy. */
  stranded?: boolean;
}

export type WeaponTarget =
  | { kind: "room"; room: number }
  | { kind: "beam"; x1: number; y1: number; x2: number; y2: number };

export interface WeaponState {
  slot: number;
  bp: string;
  powered: boolean;
  /** The player wants it on: it powers back up by itself when it can (after repairs, ion, a power shortage). */
  want?: boolean;
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
  /** Doors held open for a moment (crew walking through, a broken door), seconds left per door. */
  doorPass?: number[];
  /** Seconds of shooting each door has taken from intruders (several attackers add up); reset when it breaks. */
  doorBash?: number[];
  /** Room whose doors an enemy hacking drone has locked (recomputed every tick). */
  lockedRoom?: number;
  /** Battery: seconds of bonus power left, and lock time after. */
  battery?: { t: number; cd: number };
  /** Mind control recharge (seconds). */
  mindCd?: number;
  /** Artillery target room (null: a random room each shot). */
  artilleryTarget?: number | null;
  /** Extra reactor bars from the battery (minus a hacked battery's two), recomputed every tick. */
  reactorBonus?: number;
  /** Clone bay switched off: progress (0..1) toward losing the last crew member in its queue. */
  cloneDying?: number;
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
  /** Powered drones deploy (using a drone part); a deployed drone that loses power goes offline until it's powered again. */
  powered: boolean;
  /** The player wants it on: it powers back up by itself when it can. */
  want?: boolean;
  deployed: boolean;
  /** Orbit angle (radians) for drawing. */
  angle: number;
  /** Seconds until the next shot/repair. */
  cd: number;
  /** Ship repair drones: hull points left before it expires. */
  repairLeft?: number;
  /** Seconds until a powered drone launches. */
  launch?: number;
  /** Seconds until a destroyed drone is rebuilt (it can't be powered until then). */
  rebuild?: number;
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
  /** Fired by the hazard (an asteroid, an ASB shot), not by the other ship. */
  hazard?: boolean;
}

export type MatchEvent =
  | { e: "fire"; ship: 0 | 1; slot: number }
  /** `weapon`: the blueprint that fired it (its own hit / shield / miss sounds). */
  | { e: "miss"; ship: 0 | 1; px: number; py: number; weapon?: string }
  | { e: "shield"; ship: 0 | 1; px: number; py: number; weapon?: string }
  | { e: "hit"; ship: 0 | 1; room: number; damage: number; px: number; py: number; weapon?: string }
  | { e: "beam"; ship: 0 | 1; x1: number; y1: number; x2: number; y2: number; blocked: boolean; weapon?: string }
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
  | { e: "battery"; ship: 0 | 1; on: boolean }
  /** `ship` mind-controlled (on) or released (off) crew member `crew`. */
  | { e: "mind"; ship: 0 | 1; crew: number; on: boolean }
  /** The hazard: a flare or pulsar coming in `in` s (warn), a flare or pulse hitting `ship`, an ASB lock on `ship`. */
  | { e: "hazard"; kind: "warn" | "flare" | "pulse" | "asb"; ship?: 0 | 1; in?: number }
  /** A tactical timeout is coming in `in` seconds. */
  | { e: "pauseWarn"; in: number }
  | { e: "pause"; on: boolean; kind: "tactical" | "player"; by?: 0 | 1 }
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
  /** The running pause: a tactical timeout or a player's, seconds left, and (tactical) who's ready to go on. */
  pause?: { kind: "tactical" | "player"; by?: 0 | 1; left: number; ready?: [boolean, boolean] } | null;
  /** Each player's pause clock in seconds (-1 = unlimited). */
  pauseBank?: [number, number];
  /** Tick of the next tactical timeout. */
  nextTactical?: number;
  /**
   * The battle's hazard (random already resolved): seconds to its next strike and whether that was warned; the
   * ASB's next target; each ship's asteroid wave (phase 0 = a lull, 1 and 2 = waves), time left in it and to
   * its next rock.
   */
  hazard?: { kind: HazardKind; next: number; warned: boolean; asbTarget?: 0 | 1; rocks?: { phase: 0 | 1 | 2; left: number; spawn: number }[] };
}
