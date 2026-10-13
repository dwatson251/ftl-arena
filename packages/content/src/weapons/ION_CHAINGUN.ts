/** Chain Ion. */
import type { WeaponConfig } from "../types.ts";

export default class ION_CHAINGUN implements WeaponConfig {
  readonly id = "ION_CHAINGUN";
  readonly title = "Chain Ion";
  readonly short = "Chain I.";
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
  readonly cooldown = 14;
  readonly power = 3;
  readonly cost = 55;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 30;
  readonly stun = 0;
  readonly image = "ion_2_shot";
  readonly weaponArt = "ion_chaingun";
  readonly rarity = 4;
  readonly chargeLevels = 1;
  readonly boost: WeaponConfig["boost"] = { type: "damage", amount: 1, count: 3 };
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["ionShoot1", "ionShoot2", "ionShoot3"],
    hit: ["ionHit1", "ionHit2", "ionHit3"],
    shield: ["ionShields1", "ionShields2", "ionShields3"],
    miss: ["miss"],
  };
}
