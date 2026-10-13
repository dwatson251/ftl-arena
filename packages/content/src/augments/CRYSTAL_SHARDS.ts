/** Crystal Vengeance. */
import type { AugmentConfig } from "../types.ts";

export default class CRYSTAL_SHARDS implements AugmentConfig {
  readonly id = "CRYSTAL_SHARDS";
  readonly title = "Crystal Vengeance";
  readonly cost = 80;
  readonly value = 0.1;
  readonly stackable = false;
  readonly rarity = 0;
  /** FTL's description. */
  readonly desc = "Every time your ship takes damage, there is a 10 percent chance to break off a shard that flies at your enemy.";
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = "10% chance, when your hull is hit, to fire a 1-damage piercing shard back.";
}
