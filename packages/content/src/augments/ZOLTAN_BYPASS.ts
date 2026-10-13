/** Zoltan Shield Bypass. */
import type { AugmentConfig } from "../types.ts";

export default class ZOLTAN_BYPASS implements AugmentConfig {
  readonly id = "ZOLTAN_BYPASS";
  readonly title = "Zoltan Shield Bypass";
  readonly cost = 55;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Teleporting, bombs and mind control work through a Zoltan super shield.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_ZOLTAN_BYPASS_desc" };
}
