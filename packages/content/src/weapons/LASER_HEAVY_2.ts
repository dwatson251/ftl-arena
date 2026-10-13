/** Heavy Laser Mark II. */
import type { WeaponConfig } from "../types.ts";

export default class LASER_HEAVY_2 implements WeaponConfig {
  readonly id = "LASER_HEAVY_2";
  readonly title = "Heavy Laser Mark II";
  readonly short = "Heavy Laser II";
  readonly type = "LASER";
  readonly damage = 2;
  readonly shots = 2;
  readonly sp = 0;
  readonly fireChance = 3;
  readonly breachChance = 3;
  readonly stunChance = 2;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 13;
  readonly power = 3;
  readonly cost = 65;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "laser_heavy1";
  readonly weaponArt = "laser_heavy_2";
  readonly rarity = 4;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["heavyLaser1", "heavyLaser2", "heavyLaser3"],
    hit: ["hitHull1"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
