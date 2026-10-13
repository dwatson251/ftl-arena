/** PDS SHOT. */
import type { WeaponConfig } from "../types.ts";

export default class PDS_SHOT implements WeaponConfig {
  readonly id = "PDS_SHOT";
  readonly title = "PDS SHOT";
  readonly short = "PDS SHOT";
  readonly type = "LASER";
  readonly damage = 3;
  readonly shots = 1;
  readonly sp = 5;
  readonly fireChance = 0;
  readonly breachChance = 10;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 9;
  readonly power = 1;
  readonly cost = 55;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 20;
  readonly stun = 0;
  readonly image = "pds";
  readonly weaponArt = "laser_heavy_1";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["heavyLaser1", "heavyLaser2", "heavyLaser3"],
    hit: ["hitHull1"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
