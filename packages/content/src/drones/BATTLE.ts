/** Anti-Personnel Drone. */
import type { DroneConfig } from "../types.ts";

export default class BATTLE implements DroneConfig {
  readonly id = "BATTLE";
  readonly title = "Anti-Personnel Drone";
  readonly type: DroneConfig["type"] = "BATTLE";
  readonly power = 2;
  readonly cost = 35;
  readonly cooldown = 1;
  readonly speed = 10;
  readonly weapon = "";
  readonly image = "";
  readonly icon = "battle";
  readonly rarity = 2;
  readonly antiDrone = false;
}
