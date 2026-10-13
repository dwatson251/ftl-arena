/** Fire Beam. */
import type { WeaponConfig } from "../types.ts";

export default class BEAM_FIRE implements WeaponConfig {
  readonly id = "BEAM_FIRE";
  readonly title = "Fire Beam";
  readonly short = "Fire Beam";
  readonly type = "BEAM";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 8;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 20;
  readonly power = 2;
  readonly cost = 50;
  readonly missiles = 0;
  readonly length = 140;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "beam_fire";
  readonly rarity = 3;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam2"], hit: [], shield: [], miss: [] };
}
