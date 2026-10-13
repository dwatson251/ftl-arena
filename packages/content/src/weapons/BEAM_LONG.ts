/** Pike Beam. */
import type { WeaponConfig } from "../types.ts";

export default class BEAM_LONG implements WeaponConfig {
  readonly id = "BEAM_LONG";
  readonly title = "Pike Beam";
  readonly short = "Pike Beam";
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
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 16;
  readonly power = 2;
  readonly cost = 55;
  readonly missiles = 0;
  readonly length = 170;
  readonly radius = 0;
  readonly speed = 13;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "beam_long";
  readonly rarity = 2;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam1", "beam1_2"], hit: [], shield: [], miss: [] };
}
