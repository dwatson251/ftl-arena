/** Ion Intruder Drone. */
import type { DroneConfig } from "../types.ts";

export default class BOARDER_ION implements DroneConfig {
  readonly id = "BOARDER_ION";
  readonly title = "Ion Intruder Drone";
  readonly type: DroneConfig["type"] = "BOARDER";
  readonly power = 3;
  readonly cost = 65;
  readonly cooldown = 1;
  readonly speed = 18;
  readonly weapon = "";
  readonly image = "";
  readonly icon = "ionD";
  readonly rarity = 4;
  readonly antiDrone = false;
}
