/** Breach Missiles. */
import type { WeaponConfig } from "../types.ts";

export default class MISSILES_BREACH implements WeaponConfig {
  readonly id = "MISSILES_BREACH";
  readonly title = "Breach Missiles";
  readonly short = "Breach";
  readonly type = "MISSILES";
  readonly damage = 4;
  readonly shots = 1;
  readonly sp = 5;
  readonly fireChance = 3;
  readonly breachChance = 8;
  readonly stunChance = 1;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 22;
  readonly power = 3;
  readonly cost = 65;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "missile_breach";
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
