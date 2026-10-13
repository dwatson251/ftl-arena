/** Adv. Flak Gun. */
import type { WeaponConfig } from "../types.ts";

export default class SHOTGUN_PLAYER implements WeaponConfig {
  readonly id = "SHOTGUN_PLAYER";
  readonly title = "Adv. Flak Gun";
  readonly short = "Adv. Flak";
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
  readonly cooldown = 8;
  readonly power = 1;
  readonly cost = 60;
  readonly missiles = 0;
  readonly length = 0;
  readonly radius = 40;
  readonly speed = 26;
  readonly stun = 0;
  readonly image = "";
  readonly pieceArt: WeaponConfig["pieceArt"] = ["debris_large", "debris_med", "debris_med"];
  readonly weaponArt = "shotgun";
  readonly rarity = 0;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = {
    launch: ["flak"],
    hit: ["flakImpact1", "flakImpact2", "flakImpact3", "flakImpact4"],
    shield: ["hitShield1", "hitShield2", "hitShield3"],
    miss: ["miss"],
  };
}
