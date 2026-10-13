/** Artillery Beam. */
import type { WeaponConfig } from "../types.ts";

export default class ARTILLERY_FED implements WeaponConfig {
  readonly id = "ARTILLERY_FED";
  readonly title = "Artillery Beam";
  readonly short = "Artillery";
  readonly type = "BEAM";
  readonly damage = 1;
  readonly shots = 1;
  readonly sp = 5;
  readonly fireChance = 1;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 40;
  readonly power = 1;
  readonly cost = 0;
  readonly missiles = 0;
  readonly length = 500;
  readonly radius = 0;
  readonly speed = 13;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "artillery_fed";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam1", "beam1_2"], hit: [], shield: [], miss: [] };
}
