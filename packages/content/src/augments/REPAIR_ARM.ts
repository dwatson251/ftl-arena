/** Repair Arm. */
import type { AugmentConfig } from "../types.ts";

export default class REPAIR_ARM implements AugmentConfig {
  readonly id = "REPAIR_ARM";
  readonly title = "Repair Arm";
  readonly cost = 50;
  readonly value = 0.15;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_REPAIR_ARM_desc" };
}
