/** Shield Charge Booster. */
import type { AugmentConfig } from "../types.ts";

export default class SHIELD_RECHARGE implements AugmentConfig {
  readonly id = "SHIELD_RECHARGE";
  readonly title = "Shield Charge Booster";
  readonly cost = 45;
  readonly value = 0.15;
  readonly stackable = true;
  readonly rarity = 2;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Shield layers recharge 15% faster (stacks).";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_SHIELD_RECHARGE_desc" };
}
