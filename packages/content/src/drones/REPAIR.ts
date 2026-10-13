/** System Repair Drone. */
import type { DroneConfig } from "../types.ts";

export default class REPAIR implements DroneConfig {
  readonly id = "REPAIR";
  readonly title = "System Repair Drone";
  readonly type: DroneConfig["type"] = "REPAIR";
  readonly power = 1;
  readonly cost = 30;
  readonly cooldown = 1;
  readonly speed = 10;
  readonly weapon = "";
  readonly image = "";
  readonly icon = "repair";
  readonly rarity = 1;
  readonly antiDrone = false;
}
