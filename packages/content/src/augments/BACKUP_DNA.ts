/** Backup DNA Bank. */
import type { AugmentConfig } from "../types.ts";

export default class BACKUP_DNA implements AugmentConfig {
  readonly id = "BACKUP_DNA";
  readonly title = "Backup DNA Bank";
  readonly cost = 40;
  readonly value = 0;
  readonly stackable = false;
  readonly rarity = 2;
  /** FTL's description. */
  readonly desc = "Your crew is safe in clone storage even if the system is off or broken.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "The clone bay keeps its queue while unpowered or destroyed.";
}
