/** Fire Suppression. */
import type { AugmentConfig } from "../types.ts";

export default class FIRE_EXTINGUISHERS implements AugmentConfig {
  readonly id = "FIRE_EXTINGUISHERS";
  readonly title = "Fire Suppression";
  readonly cost = 65;
  readonly value = 1;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Fires on your ship burn out on their own, quickly.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_FIRE_EXTINGUISHERS_desc" };
}
