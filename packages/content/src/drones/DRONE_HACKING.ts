/** Hacking Drone. */
import type { DroneConfig } from "../types.ts";

export default class DRONE_HACKING implements DroneConfig {
  readonly id = "DRONE_HACKING";
  readonly title = "Hacking Drone";
  readonly type: DroneConfig["type"] = "HACKING";
  readonly power = 1;
  readonly cost = 70;
  readonly cooldown = 1;
  readonly speed = 28;
  readonly weapon = "";
  readonly image = "drone_hack";
  readonly icon = "";
  readonly rarity = 0;
  readonly antiDrone = false;
}
