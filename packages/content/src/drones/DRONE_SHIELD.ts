/** Shield Overcharger. */
import type { DroneConfig } from "../types.ts";

export default class DRONE_SHIELD implements DroneConfig {
  readonly id = "DRONE_SHIELD";
  readonly title = "Shield Overcharger";
  readonly type: DroneConfig["type"] = "SHIELD";
  readonly power = 3;
  readonly cost = 60;
  readonly cooldown = 15;
  readonly speed = 5;
  readonly weapon = "";
  readonly image = "drone_shield";
  readonly icon = "shield";
  readonly rarity = 4;
  readonly antiDrone = false;
}
