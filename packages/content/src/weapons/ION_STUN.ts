/** Ion Stunner. */
import type { WeaponConfig } from "../types.ts";

export default class ION_STUN implements WeaponConfig {
  readonly id = "ION_STUN";
  readonly title = "Ion Stunner";
  readonly short = "Ion Stunner";
  readonly type = "LASER";
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
  readonly cooldown = 10;
  readonly power = 1;
  readonly cost = 35;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 30;
  readonly stun = 5;
  readonly image = "ion_stun_shot";
  readonly weaponArt = "ion_stun";
  readonly rarity = 4;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["ionShoot1", "ionShoot2", "ionShoot3"],
    hit: ["ionHit1", "ionHit2", "ionHit3"],
    shield: ["ionShields1", "ionShields2", "ionShields3"],
    miss: ["miss"],
  };
}
