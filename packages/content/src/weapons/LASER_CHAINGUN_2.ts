/** Chain Vulcan. */
import type { WeaponConfig } from "../types.ts";

export default class LASER_CHAINGUN_2 implements WeaponConfig {
  readonly id = "LASER_CHAINGUN_2";
  readonly title = "Chain Vulcan";
  readonly short = "Vulcan";
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
  readonly cooldown = 11.1;
  readonly power = 4;
  readonly cost = 95;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "laser_light1";
  readonly weaponArt = "chainlaser_2";
  readonly rarity = 5;
  readonly chargeLevels = 1;
  readonly boost: WeaponConfig["boost"] = { type: "cooldown", amount: 2, count: 5 };
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["lightLaser1", "lightLaser2", "lightLaser3"],
    hit: ["hitHull2", "hitHull3"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
