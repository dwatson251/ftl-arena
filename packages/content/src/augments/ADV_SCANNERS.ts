/** Long-Ranged Scanners. */
import type { AugmentConfig } from "../types.ts";

export default class ADV_SCANNERS implements AugmentConfig {
  readonly id = "ADV_SCANNERS";
  readonly title = "Long-Ranged Scanners";
  readonly cost = 30;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 1;
  /** FTL's description. */
  readonly desc = "Adds additional info about nearby Beacons on the star map.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
}
