/** Boarding Drone. */
import type { DroneConfig } from "../types.ts";

export default class BOARDER implements DroneConfig {
  readonly id = "BOARDER";
  readonly title = "Boarding Drone";
  readonly type: DroneConfig["type"] = "BOARDER";
  readonly power = 3;
  readonly cost = 70;
  readonly cooldown = 1;
  readonly speed = 18;
  readonly weapon = "";
  readonly image = "";
  readonly icon = "boarder";
  readonly rarity = 4;
  readonly antiDrone = false;
}
