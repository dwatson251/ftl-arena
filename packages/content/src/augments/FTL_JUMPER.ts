/** Adv. FTL Navigation. */
import type { AugmentConfig } from "../types.ts";

export default class FTL_JUMPER implements AugmentConfig {
  readonly id = "FTL_JUMPER";
  readonly title = "Adv. FTL Navigation";
  readonly cost = 50;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Allows the ship to jump to any previously visited Beacon.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
}
