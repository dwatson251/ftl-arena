/** Scrap Recovery Arm. */
import type { AugmentConfig } from "../types.ts";

export default class SCRAP_COLLECTOR implements AugmentConfig {
  readonly id = "SCRAP_COLLECTOR";
  readonly title = "Scrap Recovery Arm";
  readonly cost = 50;
  readonly value = 0.1;
  readonly stackable = true;
  readonly rarity = 1;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_SCRAP_COLLECTOR_desc" };
}
