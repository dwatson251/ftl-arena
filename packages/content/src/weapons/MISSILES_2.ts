/** Artemis Missiles. */
import type { WeaponConfig } from "../types.ts";

export default class MISSILES_2 implements WeaponConfig {
  readonly id = "MISSILES_2";
  readonly title = "Artemis Missiles";
  readonly short = "Artemis";
  readonly type = "MISSILES";
  readonly damage = 2;
  readonly shots = 1;
  readonly sp = 5;
  readonly fireChance = 1;
  readonly breachChance = 1;
  readonly stunChance = 1;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 10;
  readonly power = 2;
  readonly cost = 38;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "missile_2";
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
