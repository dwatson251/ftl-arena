/** Heavy Crystal Mark I. */
import type { WeaponConfig } from "../types.ts";

export default class CRYSTAL_HEAVY_1 implements WeaponConfig {
  readonly id = "CRYSTAL_HEAVY_1";
  readonly title = "Heavy Crystal Mark I";
  readonly short = "Crystal H. I";
  readonly type = "MISSILES";
  readonly damage = 2;
  readonly shots = 1;
  readonly sp = 1;
  readonly fireChance = 0;
  readonly breachChance = 1;
  readonly stunChance = 2;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 13;
  readonly power = 1;
  readonly cost = 20;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 50;
  readonly stun = 0;
  readonly image = "crystal_shard3";
  readonly weaponArt = "crystal_heavy_1";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["crystalExplosion"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
