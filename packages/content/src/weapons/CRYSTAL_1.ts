/** Crystal Shard. */
import type { WeaponConfig } from "../types.ts";

export default class CRYSTAL_1 implements WeaponConfig {
  readonly id = "CRYSTAL_1";
  readonly title = "Crystal Shard";
  readonly short = "Crystal";
  readonly type = "MISSILES";
  readonly damage = 1;
  readonly shots = 1;
  readonly sp = 5;
  readonly fireChance = 0;
  readonly breachChance = 1;
  readonly stunChance = 2;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 9;
  readonly power = 1;
  readonly cost = 20;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "crystal_shard";
  readonly weaponArt = "crystal_shard";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["smallMissile1", "smallMissile2"],
    hit: ["crystalExplosion_small"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
