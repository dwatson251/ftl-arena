/** Mini Beam. */
import type { WeaponConfig } from "../types.ts";

export default class DRONE_BEAM2 implements WeaponConfig {
  readonly id = "DRONE_BEAM2";
  readonly title = "Mini Beam";
  readonly short = "Mini Beam";
  readonly type = "BEAM";
  readonly damage = 1;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 1;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 10;
  readonly power = 1;
  readonly cost = 0;
  readonly missiles = 0;
  readonly length = 40;
  readonly radius = 0;
  readonly speed = 8;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "beam_1";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam1", "beam1_2"], hit: [], shield: [], miss: [] };
}
