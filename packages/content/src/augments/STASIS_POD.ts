/** Damaged Stasis Pod. */
import type { AugmentConfig } from "../types.ts";

export default class STASIS_POD implements AugmentConfig {
  readonly id = "STASIS_POD";
  readonly title = "Damaged Stasis Pod";
  readonly cost = 30;
  readonly value = 0.15;
  readonly stackable = true;
  readonly rarity = 0;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_STASIS_POD_desc" };
}
