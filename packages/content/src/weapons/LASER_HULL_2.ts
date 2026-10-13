/** Hull Smasher Laser Mark II. */
import type { WeaponConfig } from "../types.ts";

export default class LASER_HULL_2 implements WeaponConfig {
  readonly id = "LASER_HULL_2";
  readonly title = "Hull Smasher Laser Mark II";
  readonly short = "Hull Laser II";
  readonly type = "LASER";
  readonly damage = 1;
  readonly shots = 3;
  readonly sp = 0;
  readonly fireChance = 1;
  readonly breachChance = 3;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = true;
  readonly lockdown = false;
  readonly cooldown = 15;
  readonly power = 3;
  readonly cost = 75;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 90;
  readonly stun = 0;
  readonly image = "laser_heavy1";
  readonly weaponArt = "laser_hull";
  readonly rarity = 3;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["heavyLaser1", "heavyLaser2", "heavyLaser3"],
    hit: ["hitHull1"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
