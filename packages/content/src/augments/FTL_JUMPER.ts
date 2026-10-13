/** Adv. FTL Navigation. */
import type { AugmentConfig } from "../types.ts";

export default class FTL_JUMPER implements AugmentConfig {
  readonly id = "FTL_JUMPER";
  readonly title = "Adv. FTL Navigation";
  readonly cost = 50;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_FTL_JUMPER_desc" };
}
