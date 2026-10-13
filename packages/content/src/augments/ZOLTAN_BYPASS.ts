/** Zoltan Shield Bypass. */
import type { AugmentConfig } from "../types.ts";

export default class ZOLTAN_BYPASS implements AugmentConfig {
  readonly id = "ZOLTAN_BYPASS";
  readonly title = "Zoltan Shield Bypass";
  readonly cost = 55;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Allows crew/bomb teleportation and mind control to work through Super Shields.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Teleporting, bombs and mind control work through a Zoltan super shield.";
}
