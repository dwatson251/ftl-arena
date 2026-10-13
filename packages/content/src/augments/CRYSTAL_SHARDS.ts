/** Crystal Vengeance. */
import type { AugmentConfig } from "../types.ts";

export default class CRYSTAL_SHARDS implements AugmentConfig {
  readonly id = "CRYSTAL_SHARDS";
  readonly title = "Crystal Vengeance";
  readonly cost = 80;
  readonly value = 0.1;
  readonly stackable = false;
  readonly rarity = 0;
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "10% chance, when your hull is hit, to fire a 1-damage piercing shard back.";
  /** FTL's description, from the player's install. */
  readonly text = { desc: "aug_CRYSTAL_SHARDS_desc" };
}
