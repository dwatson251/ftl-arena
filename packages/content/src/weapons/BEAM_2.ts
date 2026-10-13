/** Halberd Beam. */
import type { WeaponConfig } from "../types.ts";

export default class BEAM_2 implements WeaponConfig {
  readonly id = "BEAM_2";
  readonly title = "Halberd Beam";
  readonly short = "Halberd Beam";
  readonly type = "BEAM";
  readonly damage = 2;
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
  readonly cooldown = 17;
  readonly power = 3;
  readonly cost = 65;
  readonly missiles = 0;
  readonly length = 80;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "beam_2";
  readonly rarity = 2;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam2"], hit: [], shield: [], miss: [] };
}
