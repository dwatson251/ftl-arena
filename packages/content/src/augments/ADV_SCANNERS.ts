/** Long-Ranged Scanners. */
import type { AugmentConfig } from "../types.ts";

export default class ADV_SCANNERS implements AugmentConfig {
  readonly id = "ADV_SCANNERS";
  readonly title = "Long-Ranged Scanners";
  readonly cost = 30;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 1;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_ADV_SCANNERS_desc" };
}
