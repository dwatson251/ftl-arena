/** FTL Recharge Booster. */
import type { AugmentConfig } from "../types.ts";

export default class FTL_BOOSTER implements AugmentConfig {
  readonly id = "FTL_BOOSTER";
  readonly title = "FTL Recharge Booster";
  readonly cost = 50;
  readonly value = 0.25;
  readonly stackable = true;
  readonly rarity = 2;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_FTL_BOOSTER_desc" };
}
