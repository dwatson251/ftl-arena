/** Emergency Respirators. */
import type { AugmentConfig } from "../types.ts";

export default class O2_MASKS implements AugmentConfig {
  readonly id = "O2_MASKS";
  readonly title = "Emergency Respirators";
  readonly cost = 50;
  readonly value = 0.5;
  readonly stackable = false;
  readonly rarity = 2;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Crew take half damage from low oxygen.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_O2_MASKS_desc" };
}
