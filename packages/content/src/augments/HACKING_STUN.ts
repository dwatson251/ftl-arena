/** Hacking Stun. */
import type { AugmentConfig } from "../types.ts";

export default class HACKING_STUN implements AugmentConfig {
  readonly id = "HACKING_STUN";
  readonly title = "Hacking Stun";
  readonly cost = 60;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 3;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Everyone in the hacked room is stunned for the length of a pulse.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_HACKING_STUN_desc" };
}
