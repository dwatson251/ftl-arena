/** Drone Reactor Booster. */
import type { AugmentConfig } from "../types.ts";

export default class DRONE_SPEED implements AugmentConfig {
  readonly id = "DRONE_SPEED";
  readonly title = "Drone Reactor Booster";
  readonly cost = 50;
  readonly value = 0.25;
  readonly stackable = false;
  readonly rarity = 0;
  /** FTL's description. */
  readonly desc = "Your shipboard drones have their movement speed increased by 25 percent.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Drones fly, fire and recharge 25% faster.";
}
