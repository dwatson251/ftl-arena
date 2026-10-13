/** Scrap Recovery Arm. */
import type { AugmentConfig } from "../types.ts";

export default class SCRAP_COLLECTOR implements AugmentConfig {
  readonly id = "SCRAP_COLLECTOR";
  readonly title = "Scrap Recovery Arm";
  readonly cost = 50;
  readonly value = 0.1;
  readonly stackable = true;
  readonly rarity = 1;
  /** FTL's description. */
  readonly desc = "Allows the ship to collect 10 percent more scrap from any source.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
}
