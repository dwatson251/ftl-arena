/** Reverse Ion Field. */
import type { AugmentConfig } from "../types.ts";

export default class ION_ARMOR implements AugmentConfig {
  readonly id = "ION_ARMOR";
  readonly title = "Reverse Ion Field";
  readonly cost = 45;
  readonly value = 0.5;
  readonly stackable = true;
  readonly rarity = 2;
  /** FTL's description. */
  readonly desc = "Protects your ship from ion damage, giving a 50 percent chance to negate it entirely.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "50% chance to negate ion damage (stacks).";
}
