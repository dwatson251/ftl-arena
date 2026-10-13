/** Fire Bomb. */
import type { WeaponConfig } from "../types.ts";

export default class BOMB_FIRE implements WeaponConfig {
  readonly id = "BOMB_FIRE";
  readonly title = "Fire Bomb";
  readonly short = "Fire B.";
  readonly type = "BOMB";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 10;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 2;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 15;
  readonly power = 2;
  readonly cost = 50;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "bomb_fire";
  readonly weaponArt = "bomb_fire";
  readonly rarity = 2;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["bombTeleport"], hit: ["fireBomb"], shield: [], miss: [] };
}
