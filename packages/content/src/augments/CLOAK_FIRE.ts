/** Stealth Weapons. */
import type { AugmentConfig } from "../types.ts";

export default class CLOAK_FIRE implements AugmentConfig {
  readonly id = "CLOAK_FIRE";
  readonly title = "Stealth Weapons";
  readonly cost = 50;
  readonly value = 0.15;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Firing while cloaked no longer shortens the cloak.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_CLOAK_FIRE_desc" };
}
