/** Hull Repair. */
import type { DroneConfig } from "../types.ts";

export default class SHIP_REPAIR implements DroneConfig {
  readonly id = "SHIP_REPAIR";
  readonly title = "Hull Repair";
  readonly type: DroneConfig["type"] = "SHIP_REPAIR";
  readonly power = 2;
  readonly cost = 85;
  readonly cooldown = 1;
  readonly speed = 20;
  readonly weapon = "";
  readonly image = "drone_shiprepair";
  readonly icon = "Srepair";
  readonly rarity = 4;
  readonly antiDrone = false;
}
