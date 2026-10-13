/** Small Bomb. */
import type { WeaponConfig } from "../types.ts";

export default class BOMB_1 implements WeaponConfig {
  readonly id = "BOMB_1";
  readonly title = "Small Bomb";
  readonly short = "S. Bomb";
  readonly type = "BOMB";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 1;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 2;
  readonly persDamage = 2;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 13;
  readonly power = 1;
  readonly cost = 45;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "bomb1";
  readonly weaponArt = "bomb_1";
  readonly rarity = 1;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["bombTeleport"], hit: ["smallExplosion"], shield: [], miss: [] };
}
