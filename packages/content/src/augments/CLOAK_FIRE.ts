/** Stealth Weapons. */
import type { AugmentConfig } from "../types.ts";

export default class CLOAK_FIRE implements AugmentConfig {
  readonly id = "CLOAK_FIRE";
  readonly title = "Stealth Weapons";
  readonly cost = 50;
  readonly value = 0.15;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Prevents your weapon fire from disrupting your cloak, allowing you to shoot at will while cloaked.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Firing while cloaked no longer shortens the cloak.";
}
