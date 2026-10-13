/** Hull Missile. */
import type { WeaponConfig } from "../types.ts";

export default class MISSILES_HULL implements WeaponConfig {
  readonly id = "MISSILES_HULL";
  readonly title = "Hull Missile";
  readonly short = "Hull Mi.";
  readonly type = "MISSILES";
  readonly damage = 2;
  readonly shots = 1;
  readonly sp = 5;
  readonly fireChance = 1;
  readonly breachChance = 3;
  readonly stunChance = 1;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = true;
  readonly lockdown = false;
  readonly cooldown = 17;
  readonly power = 2;
  readonly cost = 65;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "missile_hull";
  readonly weaponArt = "missiles_2";
  readonly rarity = 3;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["smallMissile1", "smallMissile2"],
    hit: ["smallExplosion"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
