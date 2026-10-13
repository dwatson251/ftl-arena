/** Healing Burst. */
import type { WeaponConfig } from "../types.ts";

export default class BOMB_HEAL implements WeaponConfig {
  readonly id = "BOMB_HEAL";
  readonly title = "Healing Burst";
  readonly short = "Heal B.";
  readonly type = "BOMB";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = -10;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 18;
  readonly power = 1;
  readonly cost = 40;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "bomb_heal";
  readonly weaponArt = "bomb_heal";
  readonly rarity = 3;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["bombTeleport"], hit: ["healBomb"], shield: [], miss: [] };
}
