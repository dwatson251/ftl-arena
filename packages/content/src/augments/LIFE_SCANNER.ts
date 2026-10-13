/** Lifeform Scanner. */
import type { AugmentConfig } from "../types.ts";

export default class LIFE_SCANNER implements AugmentConfig {
  readonly id = "LIFE_SCANNER";
  readonly title = "Lifeform Scanner";
  readonly cost = 40;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Detects the location of any life forms, even when sensors don't function.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "See enemy crew even without sensors.";
}
