/**
 * The arena's own game content: one config class per blueprint (ships, weapons, drones, augments, crew,
 * systems). Mechanics, room layouts and stock loadouts live here, in the repo; the player's FTL install only
 * supplies art, sound, music and FTL's own prose (see Presentation).
 */
import type { AugmentBP, CrewBP, DroneBP, ShipLayout, ShipSystemSlot, SystemBP, WeaponBP } from "@ftl/data";

/** Where an item's art lives, under the asset root (/assets/img/<dir>/...). A modder can supply backup art at
 *  the same path under the fallback root (see the client's assets.ts). */
export interface SpriteRef {
  dir: string;
}

export interface ShipSprites extends SpriteRef {
  dir: "ship" | "ships_glow";
  /** File stem: <dir>/<img>_base.png, _floor.png, _gibN.png, ... */
  img: string;
  /** Stems borrowed from another hull's art (Type C hulls: the A hull's floor, shields and cloak). */
  floor?: string;
  shield?: string;
  cloak?: string;
}

export interface ShipLoadout {
  /** One race per starting crew member, in order. */
  crew: string[];
  /** FTL's crew count (enemies: the minimum) and main race. */
  crewCount: number;
  crewRace: string;
  weapons: string[];
  drones: string[];
  augments: string[];
  missiles: number;
  droneParts: number;
}

export interface ShipConfig {
  readonly id: string;
  readonly title: string;
  /** FTL's class line ("Kestrel Cruiser · Type A"). */
  readonly className: string;
  readonly health: number;
  /** Reactor bars it starts with. */
  readonly reactor: number;
  readonly weaponSlots: number;
  readonly droneSlots: number;
  readonly systems: ShipSystemSlot[];
  readonly loadout: ShipLoadout;
  /** Rooms, doors, weapon mounts, the hull image box, shield ellipse and gibs. */
  readonly layout: ShipLayout;
  readonly sprites: ShipSprites;
  /** As a player hull (the hangar). */
  readonly player?: { hangar: boolean };
  /**
   * As the opponent (in the target window), and for single-player enemy hulls, how the bot flies it.
   * `scale` multiplies the size it's drawn at in the target window (1.1 = 10% bigger).
   */
  readonly enemy: {
    scale: number;
    /** Shield bubble offset (ship pixels) where centring on the art still reads off by eye. */
    shieldNudge?: { x?: number; y?: number };
    single?: boolean;
    auto?: boolean;
    weaponPool?: string[];
    crewMax?: number;
  };
}

export interface WeaponConfig extends WeaponBP {
  /** Projectile and mount art are animation names (data/animations.xml in the player's install). */
}

export interface DroneConfig extends DroneBP {}

export interface AugmentConfig extends Omit<AugmentBP, "desc"> {
  /** What it does in the arena (our words); empty when it has no effect in a 1v1 fight. */
  readonly effect: string;
}

/** A crew race's traits in the arena. */
export interface RaceTraits {
  hp: number;
  speed: number;
  repair: number;
  /** Damage multiplier in melee. */
  combat: number;
  drone?: boolean;
  /** Boarding drones: system damage per second while sabotaging. */
  sabotage?: number;
  /** Ion intruder: ionises the room's system instead of damaging it. */
  ionBoarder?: boolean;
  fireImmune?: boolean;
  /** Multiplier on suffocation damage (0 = doesn't breathe). */
  suffocation: number;
  /** Adds this many bars of free power to the system in its room. */
  power?: number;
  /** O2 %/s removed from the room it stands in. */
  drainO2?: number;
  /** Sees enemy crew without sensors. */
  telepathic?: boolean;
  blurb: string;
}

export interface CrewConfig extends CrewBP {
  readonly traits: RaceTraits;
}

export interface SystemConfig extends Omit<SystemBP, "title" | "desc" | "levels"> {
  /** Our own title and description, for a system FTL gives no text ids for (otherwise the install's words). */
  readonly title?: string;
  readonly desc?: string;
}
