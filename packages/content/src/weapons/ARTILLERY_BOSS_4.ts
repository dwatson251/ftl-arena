/** Boss Ion. */
import type { WeaponConfig } from "../types.ts";

export default class ARTILLERY_BOSS_4 implements WeaponConfig {
  readonly id = "ARTILLERY_BOSS_4";
  readonly title = "Boss Ion";
  readonly short = "Boss Ion";
  readonly type = "LASER";
  readonly damage = 0;
  readonly shots = 3;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 1;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 28;
  readonly power = 1;
  readonly cost = 40;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 40;
  readonly stun = 0;
  readonly image = "ion_4_shot";
  readonly weaponArt = "boss_4";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["ionShoot1", "ionShoot2", "ionShoot3"],
    hit: ["ionHit1", "ionHit2", "ionHit3"],
    shield: ["ionShields1", "ionShields2", "ionShields3"],
    miss: ["miss"],
  };
}
