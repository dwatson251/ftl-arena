/** Weapon Pre-igniter. */
import type { AugmentConfig } from "../types.ts";

export default class WEAPON_PREIGNITE implements AugmentConfig {
  readonly id = "WEAPON_PREIGNITE";
  readonly title = "Weapon Pre-igniter";
  readonly cost = 120;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 4;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Powered weapons start the battle fully charged.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_WEAPON_PREIGNITE_desc" };
}
