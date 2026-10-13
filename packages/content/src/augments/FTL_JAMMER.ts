/** FTL Jammer. */
import type { AugmentConfig } from "../types.ts";

export default class FTL_JAMMER implements AugmentConfig {
  readonly id = "FTL_JAMMER";
  readonly title = "FTL Jammer";
  readonly cost = 30;
  readonly value = 2;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_FTL_JAMMER_desc" };
}
