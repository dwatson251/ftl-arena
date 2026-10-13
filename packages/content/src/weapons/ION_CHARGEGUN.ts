/** Ion Charger. */
import type { WeaponConfig } from "../types.ts";

export default class ION_CHARGEGUN implements WeaponConfig {
  readonly id = "ION_CHARGEGUN";
  readonly title = "Ion Charger";
  readonly short = "Charge I.";
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
  readonly cooldown = 6;
  readonly power = 2;
  readonly cost = 50;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 30;
  readonly stun = 0;
  readonly image = "ion_1_shot";
  readonly weaponArt = "chargeion";
  readonly rarity = 3;
  readonly chargeLevels = 3;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["ionShoot1", "ionShoot2", "ionShoot3"],
    hit: ["ionHit1", "ionHit2", "ionHit3"],
    shield: ["ionShields1", "ionShields2", "ionShields3"],
    miss: ["miss"],
  };
}
