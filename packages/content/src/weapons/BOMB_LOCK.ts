/** Crystal Lockdown Bomb. */
import type { WeaponConfig } from "../types.ts";

export default class BOMB_LOCK implements WeaponConfig {
  readonly id = "BOMB_LOCK";
  readonly title = "Crystal Lockdown Bomb";
  readonly short = "Lock B.";
  readonly type = "BOMB";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = true;
  readonly cooldown = 15;
  readonly power = 1;
  readonly cost = 45;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "bomb_lockdown";
  readonly weaponArt = "bomb_lockdown";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["bombTeleport"], hit: ["smallExplosion"], shield: [], miss: [] };
}
