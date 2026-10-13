/** Shield Overcharger. */
import type { DroneConfig } from "../types.ts";

export default class DRONE_SHIELD_PLAYER implements DroneConfig {
  readonly id = "DRONE_SHIELD_PLAYER";
  readonly title = "Shield Overcharger";
  readonly type: DroneConfig["type"] = "SHIELD";
  readonly power = 2;
  readonly cost = 60;
  readonly cooldown = 15;
  readonly speed = 5;
  readonly weapon = "";
  readonly image = "drone_shield";
  readonly icon = "shield";
  readonly rarity = 0;
  readonly antiDrone = false;
}
