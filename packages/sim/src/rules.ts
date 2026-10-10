/**
 * Every tuning constant in one place. `src` says where a number came from:
 *   bp   = read from the owner's blueprints at runtime (not here)
 *   wiki = FTL wiki / community-documented value
 *   est  = estimate, to be checked against the real game (docs/RULES.md parity table)
 */
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const TILE = 35; // px per tile (wiki)

export const RULES = {
  /** Evasion % by engine power 0..8 (wiki). */
  engineEvasion: [0, 5, 10, 15, 20, 25, 28, 31, 35],
  /** Manning bonus to evasion by skill level 0/1/2 (wiki). */
  pilotManBonus: [5, 7, 10],
  engineManBonus: [5, 7, 10],
  /** Autopilot (pilot unmanned) multiplier by pilot level (wiki: L1 none, L2 50%, L3 80%). */
  autopilot: [0, 0, 0.5, 0.8],
  /** Seconds to restore one shield layer (est ~2 s). */
  shieldRecharge: 2.0,
  /** Shield recharge speed bonus when manned, by skill (wiki 10/15/20%? est). */
  shieldManBonus: [0.1, 0.15, 0.2],
  /** Weapon charge speed bonus when manned, by skill (wiki 10/15/20%). */
  weaponManBonus: [0.1, 0.15, 0.2],
  /** Depowered weapons lose charge this many times faster than they gain it (est). */
  weaponDrain: 3,
  /** HP lost by each crew in a room per point of weapon damage (wiki 15). */
  crewDamagePerPoint: 15,
  humanHp: 100,
  /** Tiles per second (est). */
  crewSpeed: 2.2,
  /** Bars repaired per second by one crew, before the repair-skill bonus (est). */
  repairRate: 1 / 6,
  repairSkillBonus: [0, 0.1, 0.2],
  /** Breach/fire HP removed per second by one crew (est). */
  breachRepair: 20,
  firefight: 28,
  /** Ion: seconds each ion stack lasts (wiki 5 s). */
  ionDuration: 5,
  /** Stun seconds for weapons with stunChance but no explicit stun (est). */
  defaultStun: 3,
  /** Medbay healing, HP/s by power 0..3 (est). */
  medbayHeal: [0, 6.4, 16, 25.6],
  /** O2: refill %/s per room by oxygen power 0..3; drain %/s with no oxygen (est). */
  o2Refill: [0, 1.2, 3.0, 5.0],
  o2Drain: 0.35,
  /** Breach drain %/s per breached tile, scaled by 4/roomTiles (est). */
  breachDrain: 3.0,
  /** Airlock door open to space: %/s (est). */
  ventDrain: 60,
  /** %/s pulled from rooms joined to an open airlock, at one door away (halving-ish with distance) (est). */
  ventPull: 12,
  /** Door O2 equalisation rate (fraction of the difference per second); fast enough that an open ship vents in ~15-20 s (est). */
  doorFlow: 0.8,
  /** Below this O2 % crew suffocate at suffocateDps (est). */
  suffocateAt: 10,
  suffocateDps: 5,
  /** Fire: HP of a new fire tile, per-second spread chance, burn-out below this O2 %, damages (est). */
  fireHp: 100,
  fireSpreadPerSec: 0.16,
  fireMinO2: 10,
  fireStarve: 20,
  fireO2Use: 1.2,
  fireCrewDps: 8,
  /** Seconds of one burning tile to take a system bar (est). */
  fireSysSeconds: 10,
  /** Projectile flight seconds by weapon type (est; FTL's <speed> is screen-space). */
  flight: { LASER: 1.0, BURST: 1.1, MISSILES: 1.5, BOMB: 0.8, BEAM: 0.0 } as Record<string, number>,
  /** Delay between shots of one volley (est). */
  /** Gap between shots of one volley (est ~0.3 s from play; FTL's data has no field for it). */
  shotSpacing: 0.3,
  /** Beam: seconds the beam sweeps, damage lands as it crosses each room (est). */
  beamSweep: 1.0,
  /** Skill XP thresholds for levels 1 and 2 (wiki). */
  skillXp: { pilot: [15, 30], engines: [15, 30], shields: [55, 110], weapons: [65, 130], repair: [18, 36], combat: [8, 16] },
  /** Loadout prices (wiki store prices; reactor est). */
  missilePrice: 6,
  reactorPrice: (level: number) => 30 + 5 * Math.max(0, Math.floor((level - 5) / 5)),
  reactorMax: 25,
  /** Unrestricted hangar ("for fun"): every system to 20 bars, reactor to 60. */
  unlimitedLevel: 20,
  unlimitedReactor: 60,
  /** Death animation length (5 frames). */
  deathAnim: 0.9,
  /** Clone bay: seconds to clone by power 0..3 (est). */
  cloneTime: [0, 12, 9, 7],
  /** Zoltan Shield (ENERGY_SHIELD augment): super-shield points at battle start; it doesn't recharge in combat (est 5). */
  zoltanShield: 5,
  /** Fire spread across a door: x0.5 when closed, then x(1 - 0.18 per door level). */
  fireDoorClosed: 0.5,
  fireDoorPerLevel: 0.18,
  /** Augment numbers that aren't in the blueprint <value> (est). */
  fireSuppression: 12,
  slugGel: 5,
  nanoMedbay: 1.6,
  shardChance: 0.1,
  /** Drones (est): parts price, combat drone fire interval = combatFire x 15 / speed, ship repair cadence. */
  dronePartPrice: 8,
  combatFire: 3.2,
  droneFlight: 0.55,
  shipRepairEvery: 2.5,
  shipRepairAmount: 5,
  /** Defense drones only shoot at projectiles with at least this much flight left (s). */
  interceptMin: 0.15,
  maxCrew: 8,
  sellRefund: 0.5,
};

export type SkillId = keyof typeof RULES.skillXp;
export const SKILLS = Object.keys(RULES.skillXp) as SkillId[];

/**
 * Race traits that matter without boarding (wiki values; combat multipliers kept for v2 boarding).
 * repair also scales firefighting and breach repair, as in FTL.
 */
export interface RaceTraits {
  hp: number;
  speed: number;
  repair: number;
  combat: number;
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

export const RACES: Record<string, RaceTraits> = {
  human: { hp: 100, speed: 1, repair: 1, combat: 1, suffocation: 1, blurb: "Balanced." },
  engi: { hp: 100, speed: 1, repair: 2, combat: 0.5, suffocation: 1, blurb: "Repairs and fights fires twice as fast." },
  mantis: { hp: 100, speed: 1.2, repair: 0.5, combat: 1.5, suffocation: 1, blurb: "Fast; repairs at half speed." },
  rock: { hp: 150, speed: 0.5, repair: 1, combat: 1, fireImmune: true, suffocation: 1, blurb: "150 HP, immune to fire, slow." },
  slug: { hp: 100, speed: 1, repair: 1, combat: 1, suffocation: 1, telepathic: true, blurb: "Telepathic: sees enemy crew without sensors." },
  energy: { hp: 70, speed: 1, repair: 1, combat: 1, suffocation: 1, power: 1, blurb: "Powers the system it stands in by 1. 70 HP." },
  crystal: { hp: 125, speed: 0.8, repair: 1, combat: 1, suffocation: 0.5, blurb: "125 HP, half suffocation damage, slow." },
  anaerobic: { hp: 100, speed: 1, repair: 1, combat: 1, suffocation: 0, drainO2: 1.5, blurb: "Doesn't breathe; drains O2 from its room." },
};
export const raceOf = (r: string): RaceTraits => RACES[r] ?? RACES.human;

/**
 * What each augment does in the arena. Ids not listed here are kept for authenticity but have no effect
 * in a 1v1 fight (FTL jumps, the map, scrap) or wait for systems the arena doesn't have yet.
 */
export const AUGMENT_EFFECTS: Record<string, string> = {
  AUTO_COOLDOWN: "Weapon charge ceilings 10% lower (stacks).",
  SHIELD_RECHARGE: "Shield layers recharge 15% faster (stacks).",
  WEAPON_PREIGNITE: "Powered weapons start the battle fully charged.",
  EXPLOSIVE_REPLICATOR: "Missiles and bombs have a 50% chance not to use a missile.",
  ENERGY_SHIELD: "Zoltan super shield: absorbs 5 points of anything (bombs and beams too) before your shields are touched. No recharge in battle.",
  ROCK_ARMOR: "15% chance to negate hull damage from a hit (systems still take it).",
  SYSTEM_CASING: "15% chance to negate system damage from a hit (hull still takes it).",
  ION_ARMOR: "50% chance to negate ion damage (stacks).",
  CRYSTAL_SHARDS: "10% chance, when your hull is hit, to fire a 1-damage piercing shard back.",
  O2_MASKS: "Crew take half damage from low oxygen.",
  NANO_MEDBAY: "Crew heal slowly anywhere outside the medbay.",
  CREW_STIMS: "Crew move 25% faster.",
  LIFE_SCANNER: "See enemy crew even without sensors.",
  FIRE_EXTINGUISHERS: "Fires on your ship burn out on their own, quickly.",
  SLUG_GEL: "Hull breaches slowly seal themselves.",
  BACKUP_DNA: "The clone bay keeps its queue while unpowered or destroyed.",
};
