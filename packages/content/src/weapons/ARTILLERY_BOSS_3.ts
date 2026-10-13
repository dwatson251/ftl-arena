/** Boss Beam. */
import type { WeaponConfig } from "../types.ts";

export default class ARTILLERY_BOSS_3 implements WeaponConfig {
  readonly id = "ARTILLERY_BOSS_3";
  readonly title = "Boss Beam";
  readonly short = "Boss Beam";
  readonly type = "BEAM";
  readonly damage = 2;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 26;
  readonly power = 1;
  readonly cost = 70;
  readonly missiles = 0;
  readonly length = 100;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "boss_3";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam2"], hit: [], shield: [], miss: [] };
}
