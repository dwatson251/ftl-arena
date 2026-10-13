/** Drone Laser 2. */
import type { WeaponConfig } from "../types.ts";

export default class DRONE_LASER_2 implements WeaponConfig {
  readonly id = "DRONE_LASER_2";
  readonly title = "Drone Laser 2";
  readonly type = "LASER";
  readonly damage = 1;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 1;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 10;
  readonly power = 1;
  readonly cost = 0;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 120;
  readonly stun = 0;
  readonly image = "laser_light2";
  readonly weaponArt = "laser_burst_1";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["hitHull2", "hitHull3"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
