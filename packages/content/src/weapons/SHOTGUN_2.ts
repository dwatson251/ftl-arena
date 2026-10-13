/** Flak Gun Mark II. */
import type { WeaponConfig } from "../types.ts";

export default class SHOTGUN_2 implements WeaponConfig {
  readonly id = "SHOTGUN_2";
  readonly title = "Flak Gun Mark II";
  readonly short = "Flak II";
  readonly type = "BURST";
  readonly damage = 1;
  readonly shots = 7;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 21;
  readonly power = 3;
  readonly cost = 80;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 55;
  readonly speed = 26;
  readonly stun = 0;
  readonly image = "";
  readonly pieceArt: WeaponConfig["pieceArt"] = ["debris_large", "debris_large", "debris_large", "debris_med", "debris_med", "debris_med", "debris_med"];
  readonly weaponArt = "shotgun_2";
  readonly rarity = 4;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["flak"],
    hit: ["flakImpact1", "flakImpact2", "flakImpact3", "flakImpact4"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
