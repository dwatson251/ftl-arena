/** Drone Laser. */
import type { WeaponConfig } from "../types.ts";

export default class ANTI_DRONE_ION implements WeaponConfig {
  readonly id = "ANTI_DRONE_ION";
  readonly title = "Drone Laser";
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
  readonly cost = 0;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 90;
  readonly stun = 0;
  readonly image = "ion_1_shot";
  readonly weaponArt = "ion_1";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["ionShoot1", "ionShoot2", "ionShoot3"],
    hit: ["ionHit1", "ionHit2", "ionHit3"],
    shield: ["ionShields1", "ionShields2", "ionShields3"],
    miss: ["miss"],
  };
}
