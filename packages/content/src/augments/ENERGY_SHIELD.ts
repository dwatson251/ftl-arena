/** Zoltan Shield. */
import type { AugmentConfig } from "../types.ts";

export default class ENERGY_SHIELD implements AugmentConfig {
  readonly id = "ENERGY_SHIELD";
  readonly title = "Zoltan Shield";
  readonly cost = 80;
  readonly value = 2;
  readonly stackable = false;
  readonly rarity = 0;
  /** FTL's description. */
  readonly desc = "An unexplained technology creates this nearly impenetrable shield. Only the energy outburst from an FTL engine is powerful enough to recharge it.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Zoltan super shield: absorbs 5 points of anything (bombs and beams too) before your shields are touched. No recharge in battle.";
}
