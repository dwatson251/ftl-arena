/** Fire Suppression. */
import type { AugmentConfig } from "../types.ts";

export default class FIRE_EXTINGUISHERS implements AugmentConfig {
  readonly id = "FIRE_EXTINGUISHERS";
  readonly title = "Fire Suppression";
  readonly cost = 65;
  readonly value = 1;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Automatically put out fires throughout the ship.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Fires on your ship burn out on their own, quickly.";
}
