/** Burst Laser Mark I. */
import type { WeaponConfig } from "../types.ts";

export default class LASER_BURST_2_A implements WeaponConfig {
  readonly id = "LASER_BURST_2_A";
  readonly title = "Burst Laser Mark I";
  readonly short = "Burst Laser I";
  readonly type = "LASER";
  readonly damage = 1;
  readonly shots = 2;
  readonly sp = 0;
  readonly fireChance = 1;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 11;
  readonly power = 2;
  readonly cost = 50;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "laser_light1";
  readonly weaponArt = "laser_burst_2";
  readonly rarity = 1;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["hitHull2", "hitHull3"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
