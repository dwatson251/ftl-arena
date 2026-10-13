/** Stun Bomb. */
import type { WeaponConfig } from "../types.ts";

export default class BOMB_STUN implements WeaponConfig {
  readonly id = "BOMB_STUN";
  readonly title = "Stun Bomb";
  readonly short = "Stun B.";
  readonly type = "BOMB";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 1;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 17;
  readonly power = 1;
  readonly cost = 45;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 15;
  readonly image = "bomb_stun_anim";
  readonly weaponArt = "bomb_stun";
  readonly rarity = 2;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["bombTeleport"], hit: ["smallExplosion"], shield: [], miss: [] };
}
