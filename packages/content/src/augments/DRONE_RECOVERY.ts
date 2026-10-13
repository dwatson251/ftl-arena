/** Drone Recovery Arm. */
import type { AugmentConfig } from "../types.ts";

export default class DRONE_RECOVERY implements AugmentConfig {
  readonly id = "DRONE_RECOVERY";
  readonly title = "Drone Recovery Arm";
  readonly cost = 50;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 2;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_DRONE_RECOVERY_desc" };
}
