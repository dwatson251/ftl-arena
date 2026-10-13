/** Damaged Stasis Pod. */
import type { AugmentConfig } from "../types.ts";

export default class STASIS_POD implements AugmentConfig {
  readonly id = "STASIS_POD";
  readonly title = "Damaged Stasis Pod";
  readonly cost = 30;
  readonly value = 0.15;
  readonly stackable = true;
  readonly rarity = 0;
  /** FTL's description. */
  readonly desc = "This bizarre alien artifact appears to be barely operational. It has no practical function but perhaps someone can repair it.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
}
