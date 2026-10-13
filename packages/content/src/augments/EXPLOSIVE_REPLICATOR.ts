/** Explosive Replicator. */
import type { AugmentConfig } from "../types.ts";

export default class EXPLOSIVE_REPLICATOR implements AugmentConfig {
  readonly id = "EXPLOSIVE_REPLICATOR";
  readonly title = "Explosive Replicator";
  readonly cost = 60;
  readonly value = 0.5;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Missile based weapons have a 50 percent chance of not using a missile.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Missiles and bombs have a 50% chance not to use a missile.";
}
