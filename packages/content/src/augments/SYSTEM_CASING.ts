/** Titanium System Casing. */
import type { AugmentConfig } from "../types.ts";

export default class SYSTEM_CASING implements AugmentConfig {
  readonly id = "SYSTEM_CASING";
  readonly title = "Titanium System Casing";
  readonly cost = 80;
  readonly value = 0.15;
  readonly stackable = false;
  readonly rarity = 0;
  /** FTL's description. */
  readonly desc = "All ship systems have additional plating that provides a 15 percent chance to negate damage when hit (hull will still be damaged)";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "15% chance to negate system damage from a hit (hull still takes it).";
}
