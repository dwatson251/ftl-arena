/** Repair Arm. */
import type { AugmentConfig } from "../types.ts";

export default class REPAIR_ARM implements AugmentConfig {
  readonly id = "REPAIR_ARM";
  readonly title = "Repair Arm";
  readonly cost = 50;
  readonly value = 0.15;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Repairs your hull every time you collect scrap, but reduces scrap collected by 15 percent.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "";
}
