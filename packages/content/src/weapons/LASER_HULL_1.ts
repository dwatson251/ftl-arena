/** Hull Smasher Laser. */
import type { WeaponConfig } from "../types.ts";

export default class LASER_HULL_1 implements WeaponConfig {
  readonly id = "LASER_HULL_1";
  readonly title = "Hull Smasher Laser";
  readonly short = "Hull Laser I";
  readonly type = "LASER";
  readonly damage = 1;
  readonly shots = 2;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 2;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = true;
  readonly lockdown = false;
  readonly cooldown = 14;
  readonly power = 2;
  readonly cost = 55;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 75;
  readonly stun = 0;
  readonly image = "laser_heavy1";
  readonly weaponArt = "laser_hull";
  readonly rarity = 2;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["heavyLaser1", "heavyLaser2", "heavyLaser3"],
    hit: ["hitHull1"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
