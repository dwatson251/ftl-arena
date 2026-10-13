/** Glaive Beam. */
import type { WeaponConfig } from "../types.ts";

export default class BEAM_3 implements WeaponConfig {
  readonly id = "BEAM_3";
  readonly title = "Glaive Beam";
  readonly short = "Glaive Beam";
  readonly type = "BEAM";
  readonly damage = 3;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 25;
  readonly power = 4;
  readonly cost = 95;
  readonly missiles = 0;
  readonly length = 80;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "beam_3";
  readonly rarity = 5;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam2"], hit: [], shield: [], miss: [] };
}
