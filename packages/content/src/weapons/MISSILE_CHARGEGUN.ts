/** Swarm Missiles. */
import type { WeaponConfig } from "../types.ts";

export default class MISSILE_CHARGEGUN implements WeaponConfig {
  readonly id = "MISSILE_CHARGEGUN";
  readonly title = "Swarm Missiles";
  readonly short = "Swarm";
  readonly type = "BURST";
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
  readonly cooldown = 7;
  readonly power = 2;
  readonly cost = 65;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 31;
  readonly speed = 45;
  readonly stun = 0;
  readonly image = "";
  readonly pieceArt: WeaponConfig["pieceArt"] = ["missile_burst"];
  readonly weaponArt = "chargemissile";
  readonly rarity = 4;
  readonly chargeLevels = 3;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["smallMissile1", "smallMissile2"],
    hit: ["smallExplosion"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
