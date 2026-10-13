/** Reconstructive Teleport. */
import type { AugmentConfig } from "../types.ts";

export default class TELEPORT_HEAL implements AugmentConfig {
  readonly id = "TELEPORT_HEAL";
  readonly title = "Reconstructive Teleport";
  readonly cost = 70;
  readonly value = 1;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Crew arrive fully healed whenever they teleport.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_TELEPORT_HEAL_desc" };
}
