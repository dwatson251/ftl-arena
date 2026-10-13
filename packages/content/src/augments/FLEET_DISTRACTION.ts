/** Distraction Buoys. */
import type { AugmentConfig } from "../types.ts";

export default class FLEET_DISTRACTION implements AugmentConfig {
  readonly id = "FLEET_DISTRACTION";
  readonly title = "Distraction Buoys";
  readonly cost = 55;
  readonly value = 1;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_FLEET_DISTRACTION_desc" };
}
