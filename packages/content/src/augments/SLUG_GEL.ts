/** Slug Repair Gel. */
import type { AugmentConfig } from "../types.ts";

export default class SLUG_GEL implements AugmentConfig {
  readonly id = "SLUG_GEL";
  readonly title = "Slug Repair Gel";
  readonly cost = 60;
  readonly value = 0.25;
  readonly stackable = false;
  readonly rarity = 0;
  /** FTL's description. */
  readonly desc = "Slug ships excrete a thick gel that automatically repairs any hull breaches.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Hull breaches slowly seal themselves.";
}
