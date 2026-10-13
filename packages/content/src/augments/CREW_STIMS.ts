/** Mantis Pheromones. */
import type { AugmentConfig } from "../types.ts";

export default class CREW_STIMS implements AugmentConfig {
  readonly id = "CREW_STIMS";
  readonly title = "Mantis Pheromones";
  readonly cost = 50;
  readonly value = 0.25;
  readonly stackable = false;
  readonly rarity = 0;
  /** FTL's description. */
  readonly desc = "Your crew's movement speed is increased by 25 percent.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Crew move 25% faster.";
}
