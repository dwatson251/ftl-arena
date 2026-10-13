/** Burst Laser Mark III. */
import type { WeaponConfig } from "../types.ts";

export default class LASER_BURST_5 implements WeaponConfig {
  readonly id = "LASER_BURST_5";
  readonly title = "Burst Laser Mark III";
  readonly short = "Burst L. III";
  readonly type = "LASER";
  readonly damage = 1;
  readonly shots = 5;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 19;
  readonly power = 4;
  readonly cost = 95;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "laser_light2";
  readonly weaponArt = "laser_burst_5";
  readonly rarity = 4;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["hitHull2", "hitHull3"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
