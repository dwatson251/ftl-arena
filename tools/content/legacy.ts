/** Snapshots of the hand-written tables that lived in packages/sim/src/rules.ts before the content classes
 *  (the generator seeds the crew and augment classes from them). */
import type { RaceTraits } from "../../packages/content/src/types.ts";

export const RACES_V1: Record<string, RaceTraits> = {
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
  boarder: { hp: 150, speed: 0.5, repair: 0, combat: 1, suffocation: 0, fireImmune: true, drone: true, sabotage: 2, blurb: "Boarding drone." },
  boarder_ion: { hp: 150, speed: 0.5, repair: 0, combat: 0.5, suffocation: 0, fireImmune: true, drone: true, sabotage: 1, ionBoarder: true, blurb: "Ion intruder drone." },
};

export const AUGMENT_EFFECTS_V1: Record<string, string> = {
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
