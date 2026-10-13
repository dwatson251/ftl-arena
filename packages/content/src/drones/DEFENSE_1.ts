/** Defense Drone Mark I. */
import type { DroneConfig } from "../types.ts";

export default class DEFENSE_1 implements DroneConfig {
  readonly id = "DEFENSE_1";
  readonly title = "Defense Drone Mark I";
  readonly type: DroneConfig["type"] = "DEFENSE";
  readonly power = 2;
  readonly cost = 50;
  readonly cooldown = 1;
  readonly speed = 5;
  readonly weapon = "DRONE_LASER";
  readonly image = "drone_defense";
  readonly icon = "defense";
  readonly rarity = 1;
  readonly antiDrone = false;
}
