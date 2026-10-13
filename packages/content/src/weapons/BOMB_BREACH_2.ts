/** Breach Bomb Mark II. */
import type { WeaponConfig } from "../types.ts";

export default class BOMB_BREACH_2 implements WeaponConfig {
  readonly id = "BOMB_BREACH_2";
  readonly title = "Breach Bomb Mark II";
  readonly short = "Breach II";
  readonly type = "BOMB";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 10;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 3;
  readonly persDamage = 3;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 17;
  readonly power = 2;
  readonly cost = 60;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "bomb_breach";
  readonly weaponArt = "bomb_breach";
  readonly rarity = 4;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["bombTeleport"], hit: ["smallExplosion"], shield: [], miss: [] };
}
