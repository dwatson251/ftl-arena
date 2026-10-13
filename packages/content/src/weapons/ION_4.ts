/** Ion Blast Mark II. */
import type { WeaponConfig } from "../types.ts";

export default class ION_4 implements WeaponConfig {
  readonly id = "ION_4";
  readonly title = "Ion Blast Mark II";
  readonly short = "Ion Blast II";
  readonly type = "LASER";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 1;
  readonly ion = 1;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 4;
  readonly power = 3;
  readonly cost = 70;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 30;
  readonly stun = 0;
  readonly image = "ion_1_shot";
  readonly weaponArt = "ion_4";
  readonly rarity = 4;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["ionShoot1", "ionShoot2", "ionShoot3"],
    hit: ["ionHit1", "ionHit2", "ionHit3"],
    shield: ["ionShields1", "ionShields2", "ionShields3"],
    miss: ["miss"],
  };
}
