/** Drone Missile. */
import type { WeaponConfig } from "../types.ts";

export default class DRONE_MISSILE implements WeaponConfig {
  readonly id = "DRONE_MISSILE";
  readonly title = "Drone Missile";
  readonly short = "M. 0";
  readonly type = "MISSILES";
  readonly damage = 1;
  readonly shots = 1;
  readonly sp = 5;
  readonly fireChance = 1;
  readonly breachChance = 1;
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
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "missile_1";
  readonly weaponArt = "missiles_1";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["smallMissile1", "smallMissile2"],
    hit: ["smallExplosion"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
