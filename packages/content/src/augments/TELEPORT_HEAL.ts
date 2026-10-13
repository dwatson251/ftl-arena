/** Reconstructive Teleport. */
import type { AugmentConfig } from "../types.ts";

export default class TELEPORT_HEAL implements AugmentConfig {
  readonly id = "TELEPORT_HEAL";
  readonly title = "Reconstructive Teleport";
  readonly cost = 70;
  readonly value = 1;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "Crew gets fully healed by teleportation.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Crew arrive fully healed whenever they teleport.";
}
