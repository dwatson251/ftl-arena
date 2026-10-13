/** Reverse Ion Field. */
import type { AugmentConfig } from "../types.ts";

export default class ION_ARMOR implements AugmentConfig {
  readonly id = "ION_ARMOR";
  readonly title = "Reverse Ion Field";
  readonly cost = 45;
  readonly value = 0.5;
  readonly stackable = true;
  readonly rarity = 2;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "50% chance to negate ion damage (stacks).";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_ION_ARMOR_desc" };
}
