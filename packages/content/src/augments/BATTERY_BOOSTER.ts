/** Battery Charger. */
import type { AugmentConfig } from "../types.ts";

export default class BATTERY_BOOSTER implements AugmentConfig {
  readonly id = "BATTERY_BOOSTER";
  readonly title = "Battery Charger";
  readonly cost = 40;
  readonly value = 0.5;
  readonly stackable = false;
  readonly rarity = 2;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "The battery's lock time after use is halved.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_BATTERY_BOOSTER_desc" };
}
