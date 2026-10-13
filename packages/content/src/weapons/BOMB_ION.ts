/** Ion Bomb. */
import type { WeaponConfig } from "../types.ts";

export default class BOMB_ION implements WeaponConfig {
  readonly id = "BOMB_ION";
  readonly title = "Ion Bomb";
  readonly short = "I. Bomb";
  readonly type = "BOMB";
  readonly damage = 0;
  readonly shots = 1;
  readonly sp = 0;
  readonly fireChance = 0;
  readonly breachChance = 0;
  readonly stunChance = 2;
  readonly ion = 4;
  readonly sysDamage = 0;
  readonly persDamage = 0;
  readonly hullBust = false;
  readonly lockdown = false;
  readonly cooldown = 22;
  readonly power = 1;
  readonly cost = 55;
  readonly missiles = 1;
  readonly length = 0;
  readonly radius = 0;
  readonly speed = 0;
  readonly stun = 0;
  readonly image = "bomb_ion";
  readonly weaponArt = "bomb_ion";
  readonly rarity = 3;
  readonly chargeLevels = 1;
  readonly sounds: WeaponConfig["sounds"] = { launch: ["bombTeleport"], hit: ["ionHit1", "ionHit2", "ionHit3"], shield: [], miss: [] };
}
