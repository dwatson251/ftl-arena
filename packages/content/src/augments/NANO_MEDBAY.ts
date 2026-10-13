/** Engi Med-bot Dispersal. */
import type { AugmentConfig } from "../types.ts";

export default class NANO_MEDBAY implements AugmentConfig {
  readonly id = "NANO_MEDBAY";
  readonly title = "Engi Med-bot Dispersal";
  readonly cost = 60;
  readonly value = 0.25;
  readonly stackable = false;
  readonly rarity = 0;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Crew heal slowly anywhere outside the medbay.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_NANO_MEDBAY_desc" };
}
