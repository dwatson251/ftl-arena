/** Anti-Ship Fire Drone. */
import type { DroneConfig } from "../types.ts";

export default class COMBAT_FIRE implements DroneConfig {
  readonly id = "COMBAT_FIRE";
  readonly title = "Anti-Ship Fire Drone";
  readonly type: DroneConfig["type"] = "COMBAT";
  readonly power = 3;
  readonly cost = 50;
  readonly cooldown = 1;
  readonly speed = 12;
  readonly weapon = "DRONE_FIREBEAM";
  readonly image = "drone_fire";
  readonly icon = "fire";
  readonly rarity = 4;
  readonly antiDrone = false;
}
