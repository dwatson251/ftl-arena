/** Titanium System Casing. */
import type { AugmentConfig } from "../types.ts";

export default class SYSTEM_CASING implements AugmentConfig {
  readonly id = "SYSTEM_CASING";
  readonly title = "Titanium System Casing";
  readonly cost = 80;
  readonly value = 0.15;
  readonly stackable = false;
  readonly rarity = 0;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "15% chance to negate system damage from a hit (hull still takes it).";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_SYSTEM_CASING_desc" };
}
