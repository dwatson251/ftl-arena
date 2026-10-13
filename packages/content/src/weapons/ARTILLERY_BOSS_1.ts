/** Boss Laser. */
import type { WeaponConfig } from "../types.ts";

export default class ARTILLERY_BOSS_1 implements WeaponConfig {
  readonly id = "ARTILLERY_BOSS_1";
  readonly title = "Boss Laser";
  readonly short = "Boss Laser";
  readonly type = "LASER";
  readonly damage = 1;
  readonly shots = 3;
  readonly sp = 0;
  readonly fireChance = 1;
  readonly breachChance = 1;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 20;
  readonly power = 1;
  readonly cost = 55;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "laser_heavy1";
  readonly weaponArt = "boss_1";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["hitHull1"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
