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
  /** Medbay healing, HP/s by power 0..3 (wiki: x1 / x1.5 / x3). It heals crew fighting in it too. */
  medbayHeal: [0, 6.4, 9.6, 19.2],
  /** O2: refill %/s per room by oxygen power 0..3 (est); drain %/s with the oxygen system off (wiki 1.2). */
  o2Refill: [0, 1.2, 3.0, 5.0],
  o2Drain: 1.2,
  /** Breach drain %/s per breached tile, scaled by 4/roomTiles (est). */
  breachDrain: 3.0,
  /** Airlock door open to space: %/s (est). */
  ventDrain: 60,
  /** %/s pulled from rooms joined to an open airlock, at one door away (halving-ish with distance) (est). */
  ventPull: 12,
  /** Door O2 equalisation rate (fraction of the difference per second); fast enough that an open ship vents in ~15-20 s (est). */
  doorFlow: 0.8,
  /** Below this O2 % crew suffocate at suffocateDps; FTL's warning stripes show at the same level (wiki 5 %). */
  suffocateAt: 5,
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
  /** Death animation length (5 frames). */
  deathAnim: 0.9,
  /** Clone bay: seconds to clone by power 0..3 (wiki), one crew member at a time; switched off, it loses the
   * last in its queue every `cloneLoss` s (wiki); the materialise animation lasts `cloneSpawn` s (FTL's
   * <race>_clone anim). */
  cloneTime: [0, 12, 9, 7],
  cloneLoss: 3,
  cloneSpawn: 0.75,
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
  /** Boarding (est, from play and the wiki): teleporter recharge by level, melee damage per second for a
   * 1x race, combat skill bonus, sabotage (system damage per second of a 1x boarder), door break times by
   * door level (0 = no doors system), boarding drone flight. */
  teleCooldown: [0, 20, 15, 10],
  teleMax: 4,
  meleeDps: 6,
  combatSkillBonus: [0, 0.1, 0.2],
  sabotageRate: 0.05,
  doorBreak: [2, 4, 7, 11, 16],
  /** A broken door stays open this long, then shuts again (est); crew walking through hold it open briefly. */
  doorBrokenOpen: 4,
  doorPassOpen: 0.35,
  boarderFlight: 2.4,
  /** Teleporting takes a beam-out and a beam-in (est, from FTL's teleport animation). */
  teleportTime: 1,
  /** Drones (est): launch time after powering a slot; rebuild time after one is destroyed. */
  droneLaunch: 1.5,
  droneRebuild: 10,
  /** FTL's limit on installed systems (subsystems don't count). */
  maxSystems: 8,
  /** Cloaking: duration by level ("Cloak: N seconds"; est 5/10/15), recharge after (est), +60 evasion (FTL text). */
  cloakDuration: [0, 5, 10, 15],
  cloakCooldown: 20,
  cloakEvasion: 60,
  /** Hacking (est): pulse length by level, recharge after a pulse, drone flight, and pulse effect rates. */
  hackPulse: [0, 4, 7, 10],
  hackCooldown: 15,
  hackFlight: 2.4,
  hackO2Drain: 4,
  hackMedbayDps: 8,
  hackWeaponDrain: 1,
  hackDroneKill: 0.33,
  /** Battery ("Provides N bonus power"): +2/+4 for 30 s, then 30 s locked (est; Battery Charger halves the lock). */
  batteryPower: [0, 2, 4],
  batteryDuration: 30,
  batteryCooldown: 30,
  /** Mind control (est): control time by level, recharge after, and the level 2/3 health and damage boost. */
  mindDuration: [0, 14, 20, 28],
  mindCooldown: 20,
  mindBoost: [0, 0, 0.3, 0.6],
  /** Artillery (est): charge time multiplier by system level (the weapon's own cooldown at level 1). */
  artilleryCharge: [1, 1, 0.8, 0.65, 0.5],
  /** Shield Overcharger drone: one super-shield point per cooldown, up to this many (est). */
  shieldDroneMax: 5,
  /** Firing while cloaked cuts this many seconds off the cloak (est; Stealth Weapons prevents it). */
  cloakFirePenalty: 1.5,
  /** The Rebel flagship's crew (its blueprints don't list one; est). */
  flagshipCrew: 8,
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
  /** Drone units: not hireable, don't count as crew. */
  drone?: boolean;
  /** Sabotage speed multiplier (boarding drones). */
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

export const RACES: Record<string, RaceTraits> = {
  human: { hp: 100, speed: 1, repair: 1, combat: 1, suffocation: 1, blurb: "Balanced." },
  engi: { hp: 100, speed: 1, repair: 2, combat: 0.5, suffocation: 1, blurb: "Repairs and fights fires twice as fast." },
  mantis: { hp: 100, speed: 1.2, repair: 0.5, combat: 1.5, suffocation: 1, blurb: "Fast; repairs at half speed." },
  rock: { hp: 150, speed: 0.5, repair: 1, combat: 1, fireImmune: true, suffocation: 1, blurb: "150 HP, immune to fire, slow." },
  slug: { hp: 100, speed: 1, repair: 1, combat: 1, suffocation: 1, telepathic: true, blurb: "Telepathic: sees enemy crew without sensors." },
  energy: { hp: 70, speed: 1, repair: 1, combat: 1, suffocation: 1, power: 1, blurb: "Powers the system it stands in by 1. 70 HP." },
  crystal: { hp: 125, speed: 0.8, repair: 1, combat: 1, suffocation: 0.5, blurb: "125 HP, half suffocation damage, slow." },
  // Lanius (wiki): drain oxygen "about as fast as a hull breach in a single square"; 20% slower.
  anaerobic: { hp: 100, speed: 0.8, repair: 1, combat: 1, suffocation: 0, drainO2: 1, blurb: "Doesn't breathe; drains its room's oxygen like a hull breach. 20% slower." },
  // Drone units (not hireable): anti-personnel, system repair, boarding (est stats).
  battle: { hp: 150, speed: 1, repair: 0, combat: 1, suffocation: 0, fireImmune: true, drone: true, blurb: "Anti-personnel drone." },
  repair: { hp: 70, speed: 1, repair: 1, combat: 0, suffocation: 0, fireImmune: true, drone: true, blurb: "System repair drone." },
  boarder: { hp: 150, speed: 1, repair: 0, combat: 1, suffocation: 0, fireImmune: true, drone: true, sabotage: 2, blurb: "Boarding drone." },
  boarder_ion: { hp: 150, speed: 1, repair: 0, combat: 0.5, suffocation: 0, fireImmune: true, drone: true, sabotage: 1, ionBoarder: true, blurb: "Ion intruder drone." },
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
  DRONE_SPEED: "Drones fly, fire and recharge 25% faster.",
  DEFENSE_SCRAMBLER: "Enemy defense drones can't target anything.",
  CLOAK_FIRE: "Firing while cloaked no longer shortens the cloak.",
  TELEPORT_HEAL: "Crew arrive fully healed whenever they teleport.",
  BATTERY_BOOSTER: "The battery's lock time after use is halved.",
  HACKING_STUN: "Everyone in the hacked room is stunned for the length of a pulse.",
  ZOLTAN_BYPASS: "Teleporting, bombs and mind control work through a Zoltan super shield.",
};
