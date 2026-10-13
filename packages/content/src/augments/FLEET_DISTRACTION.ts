/** Distraction Buoys. */
import type { AugmentConfig } from "../types.ts";

export default class FLEET_DISTRACTION implements AugmentConfig {
  readonly id = "FLEET_DISTRACTION";
  readonly title = "Distraction Buoys";
  readonly cost = 55;
  readonly value = 1;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Leaves a false signal at sector start to delay Rebels 1 jump.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
}
