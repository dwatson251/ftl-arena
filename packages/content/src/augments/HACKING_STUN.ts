/** Hacking Stun. */
import type { AugmentConfig } from "../types.ts";

export default class HACKING_STUN implements AugmentConfig {
  readonly id = "HACKING_STUN";
  readonly title = "Hacking Stun";
  readonly cost = 60;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 3;
  /** FTL's description. */
  readonly desc = "All crew inside a room during a Hacking Pulse will be stunned for the duration.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "Everyone in the hacked room is stunned for the length of a pulse.";
}
