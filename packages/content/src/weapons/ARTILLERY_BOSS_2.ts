/** Boss Missile. */
import type { WeaponConfig } from "../types.ts";

export default class ARTILLERY_BOSS_2 implements WeaponConfig {
  readonly id = "ARTILLERY_BOSS_2";
  readonly title = "Boss Missile";
  readonly short = "Boss M.";
  readonly type = "MISSILES";
  readonly damage = 1;
  readonly shots = 3;
  readonly sp = 5;
  readonly fireChance = 3;
  readonly breachChance = 2;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 23;
  readonly power = 1;
  readonly cost = 80;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "missile_1";
  readonly weaponArt = "boss_2";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["smallMissile1", "smallMissile2"],
    hit: ["smallExplosion"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
