/** Heavy Ion. */
import type { WeaponConfig } from "../types.ts";

export default class ION_2 implements WeaponConfig {
  readonly id = "ION_2";
  readonly title = "Heavy Ion";
  readonly short = "Heavy Ion";
  readonly type = "LASER";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 2;
  readonly ion = 2;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 13;
  readonly power = 2;
  readonly cost = 45;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 40;
  readonly stun = 0;
  readonly image = "ion_4_shot";
  readonly weaponArt = "ion_2";
  readonly rarity = 3;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["ionShoot1", "ionShoot2", "ionShoot3"],
    hit: ["ionHit1", "ionHit2", "ionHit3"],
    shield: ["ionShields1", "ionShields2", "ionShields3"],
    miss: ["miss"],
  };
}
