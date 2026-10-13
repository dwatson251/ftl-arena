/** FTL Recharge Booster. */
import type { AugmentConfig } from "../types.ts";

export default class FTL_BOOSTER implements AugmentConfig {
  readonly id = "FTL_BOOSTER";
  readonly title = "FTL Recharge Booster";
  readonly cost = 50;
  readonly value = 0.25;
  readonly stackable = true;
  readonly rarity = 2;
  /** FTL's description. */
  readonly desc = "The ship's FTL Drive powers up 25 percent faster.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
}
