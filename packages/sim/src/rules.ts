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
  shotSpacing: 0.18,
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
