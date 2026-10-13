/** Crystal Burst Mark II. */
import type { WeaponConfig } from "../types.ts";

export default class CRYSTAL_BURST_2 implements WeaponConfig {
  readonly id = "CRYSTAL_BURST_2";
  readonly title = "Crystal Burst Mark II";
  readonly short = "Crystal B. II";
  readonly type = "MISSILES";
  readonly damage = 1;
  readonly shots = 3;
  readonly sp = 1;
  readonly fireChance = 0;
  readonly breachChance = 1;
  readonly stunChance = 1;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 17;
  readonly power = 3;
  readonly cost = 20;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 50;
  readonly stun = 0;
  readonly image = "crystal_shard2";
  readonly weaponArt = "crystal_burst_2";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["crystalExplosion_small"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
