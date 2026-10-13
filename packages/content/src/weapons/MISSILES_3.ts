/** Hermes Missile. */
import type { WeaponConfig } from "../types.ts";

export default class MISSILES_3 implements WeaponConfig {
  readonly id = "MISSILES_3";
  readonly title = "Hermes Missile";
  readonly short = "Hermes";
  readonly type = "MISSILES";
  readonly damage = 3;
  readonly shots = 1;
  readonly sp = 5;
  readonly fireChance = 3;
  readonly breachChance = 2;
  readonly stunChance = 1;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 14;
  readonly power = 3;
  readonly cost = 45;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "missile_3";
  readonly weaponArt = "missiles_2";
  readonly rarity = 2;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["smallMissile1", "smallMissile2"],
    hit: ["smallExplosion"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
