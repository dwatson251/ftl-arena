/** Drone Reactor Booster. */
import type { AugmentConfig } from "../types.ts";

export default class DRONE_SPEED implements AugmentConfig {
  readonly id = "DRONE_SPEED";
  readonly title = "Drone Reactor Booster";
  readonly cost = 50;
  readonly value = 0.25;
  readonly stackable = false;
  readonly rarity = 0;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Drones fly, fire and recharge 25% faster.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_DRONE_SPEED_desc" };
}
