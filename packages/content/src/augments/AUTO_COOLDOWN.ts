/** Automated Re-loader. */
import type { AugmentConfig } from "../types.ts";

export default class AUTO_COOLDOWN implements AugmentConfig {
  readonly id = "AUTO_COOLDOWN";
  readonly title = "Automated Re-loader";
  readonly cost = 40;
  readonly value = 0.1;
  readonly stackable = true;
  readonly rarity = 2;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Weapon charge ceilings 10% lower (stacks).";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_AUTO_COOLDOWN_desc" };
}
