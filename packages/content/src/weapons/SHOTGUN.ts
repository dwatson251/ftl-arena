/** Flak Gun Mark I. */
import type { WeaponConfig } from "../types.ts";

export default class SHOTGUN implements WeaponConfig {
  readonly id = "SHOTGUN";
  readonly title = "Flak Gun Mark I";
  readonly short = "Flak I";
  readonly type = "BURST";
  readonly damage = 1;
  readonly shots = 3;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 0;
  readonly ion = 0;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 10;
  readonly power = 2;
  readonly cost = 65;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 42;
  readonly speed = 26;
  readonly stun = 0;
  readonly image = "";
  readonly pieceArt: WeaponConfig["pieceArt"] = ["debris_large", "debris_med", "debris_med"];
  readonly weaponArt = "shotgun";
  readonly rarity = 1;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["flak"],
    hit: ["flakImpact1", "flakImpact2", "flakImpact3", "flakImpact4"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
