/** Rock Plating. */
import type { AugmentConfig } from "../types.ts";

export default class ROCK_ARMOR implements AugmentConfig {
  readonly id = "ROCK_ARMOR";
  readonly title = "Rock Plating";
  readonly cost = 80;
  readonly value = 0.15;
  readonly stackable = false;
  readonly rarity = 0;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "15% chance to negate hull damage from a hit (systems still take it).";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_ROCK_ARMOR_desc" };
}
