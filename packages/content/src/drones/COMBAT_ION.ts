/** Anti-Ship Ion Drone I. */
import type { DroneConfig } from "../types.ts";

export default class COMBAT_ION implements DroneConfig {
  readonly id = "COMBAT_ION";
  readonly title = "Anti-Ship Ion Drone I";
  readonly type: DroneConfig["type"] = "COMBAT";
  readonly power = 2;
  readonly cost = 50;
  readonly cooldown = 1;
  readonly speed = 5;
  readonly weapon = "DRONE_ION";
  readonly image = "drone_combat";
  readonly icon = "";
  readonly rarity = 0;
  readonly antiDrone = false;
}
