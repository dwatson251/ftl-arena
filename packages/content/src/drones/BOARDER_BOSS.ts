/** Boarding Drone. */
import type { DroneConfig } from "../types.ts";

export default class BOARDER_BOSS implements DroneConfig {
  readonly id = "BOARDER_BOSS";
  readonly title = "Boarding Drone";
  readonly type: DroneConfig["type"] = "BOARDER";
  readonly power = 2;
  readonly cost = 70;
  readonly cooldown = 1;
  readonly speed = 18;
  readonly weapon = "";
  readonly image = "";
  readonly icon = "";
  readonly rarity = 0;
  readonly antiDrone = false;
}
