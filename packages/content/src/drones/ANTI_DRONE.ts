/** Anti-Combat Drone. */
import type { DroneConfig } from "../types.ts";

export default class ANTI_DRONE implements DroneConfig {
  readonly id = "ANTI_DRONE";
  readonly title = "Anti-Combat Drone";
  readonly type: DroneConfig["type"] = "DEFENSE";
  readonly power = 1;
  readonly cost = 35;
  readonly cooldown = 7;
  readonly speed = 5;
  readonly weapon = "ANTI_DRONE_ION";
  readonly image = "drone_anti";
  readonly icon = "antiD";
  readonly rarity = 1;
  readonly antiDrone = true;
}
