/** Burst Laser Mark II. */
import type { WeaponConfig } from "../types.ts";

export default class LASER_BURST_3 implements WeaponConfig {
  readonly id = "LASER_BURST_3";
  readonly title = "Burst Laser Mark II";
  readonly short = "Burst Laser II";
  readonly type = "LASER";
  readonly damage = 1;
  readonly shots = 3;
  readonly sp = 0;
  readonly fireChance = 1;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 12;
  readonly power = 2;
  readonly cost = 80;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "laser_light2";
  readonly weaponArt = "laser_burst_3";
  readonly rarity = 4;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["hitHull2", "hitHull3"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
