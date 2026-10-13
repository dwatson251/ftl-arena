/** Hull Beam. */
import type { WeaponConfig } from "../types.ts";

export default class BEAM_HULL implements WeaponConfig {
  readonly id = "BEAM_HULL";
  readonly title = "Hull Beam";
  readonly short = "Hull Beam";
  readonly type = "BEAM";
  readonly damage = 1;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = true;
  readonly lockdown = false;
  readonly cooldown = 14;
  readonly power = 2;
  readonly cost = 70;
  readonly missiles = 0;
  readonly length = 100;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "beam_hull";
  readonly rarity = 3;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam1", "beam1_2"], hit: [], shield: [], miss: [] };
}
