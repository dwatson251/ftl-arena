/** Heavy Laser Mark I. */
import type { WeaponConfig } from "../types.ts";

export default class LASER_HEAVY_1 implements WeaponConfig {
  readonly id = "LASER_HEAVY_1";
  readonly title = "Heavy Laser Mark I";
  readonly short = "Heavy Laser I";
  readonly type = "LASER";
  readonly damage = 2;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 3;
  readonly breachChance = 3;
  readonly stunChance = 2;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 9;
  readonly power = 1;
  readonly cost = 50;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "laser_heavy1";
  readonly weaponArt = "laser_heavy_1";
  readonly rarity = 2;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["heavyLaser1", "heavyLaser2", "heavyLaser3"],
    hit: ["hitHull1"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
