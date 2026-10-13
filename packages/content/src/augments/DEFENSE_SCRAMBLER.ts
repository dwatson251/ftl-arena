/** Defense Scrambler. */
import type { AugmentConfig } from "../types.ts";

export default class DEFENSE_SCRAMBLER implements AugmentConfig {
  readonly id = "DEFENSE_SCRAMBLER";
  readonly title = "Defense Scrambler";
  readonly cost = 80;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 4;
  /** FTL's description. */
  readonly desc = "Prevents enemy defense drones from targeting anything.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Enemy defense drones can't target anything.";
}
