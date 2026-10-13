/** Heavy Crystal Mark II. */
import type { WeaponConfig } from "../types.ts";

export default class CRYSTAL_HEAVY_2 implements WeaponConfig {
  readonly id = "CRYSTAL_HEAVY_2";
  readonly title = "Heavy Crystal Mark II";
  readonly short = "Crystal H. II";
  readonly type = "MISSILES";
  readonly damage = 4;
  readonly shots = 1;
  readonly sp = 1;
  readonly fireChance = 0;
  readonly breachChance = 10;
  readonly stunChance = 2;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 19;
  readonly power = 3;
  readonly cost = 20;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 50;
  readonly stun = 0;
  readonly image = "crystal_shard3";
  readonly weaponArt = "crystal_heavy_2";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["crystalExplosion"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
