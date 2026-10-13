/** Shield Charge Booster. */
import type { AugmentConfig } from "../types.ts";

export default class SHIELD_RECHARGE implements AugmentConfig {
  readonly id = "SHIELD_RECHARGE";
  readonly title = "Shield Charge Booster";
  readonly cost = 45;
  readonly value = 0.15;
  readonly stackable = true;
  readonly rarity = 2;
  /** FTL's description. */
  readonly desc = "Boosts the ship's shield recharge rate by 15 percent.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Shield layers recharge 15% faster (stacks).";
}
