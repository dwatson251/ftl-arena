/** Anti-Bio Beam. */
import type { WeaponConfig } from "../types.ts";

export default class BEAM_BIO implements WeaponConfig {
  readonly id = "BEAM_BIO";
  readonly title = "Anti-Bio Beam";
  readonly short = "Anti-Bio Beam";
  readonly type = "BEAM";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 4;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 16;
  readonly power = 2;
  readonly cost = 50;
  readonly missiles = 0;
  readonly length = 140;
  readonly radius = 0;
  readonly speed = 13;
  readonly stun = 0;
  readonly image = "beam_contact";
  readonly weaponArt = "beam_bio";
  readonly rarity = 5;
  readonly chargeLevels = 1;
  readonly color: WeaponConfig["color"] = [255, 110, 0];
  readonly sounds: WeaponConfig["sounds"] = { launch: ["beam2"], hit: [], shield: [], miss: [] };
}
