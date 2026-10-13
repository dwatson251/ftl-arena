/** Repair Burst. */
import type { WeaponConfig } from "../types.ts";

export default class BOMB_HEAL_SYSTEM implements WeaponConfig {
  readonly id = "BOMB_HEAL_SYSTEM";
  readonly title = "Repair Burst";
  readonly short = "Repair B.";
  readonly type = "BOMB";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = -8;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 14;
  readonly power = 1;
  readonly cost = 40;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "bomb_repair_anim";
  readonly weaponArt = "bomb_repair";
  readonly rarity = 3;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["bombTeleport"], hit: ["healBomb"], shield: [], miss: [] };
}
