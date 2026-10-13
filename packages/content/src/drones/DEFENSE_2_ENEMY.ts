/** Defense Drone Mark II. */
import type { DroneConfig } from "../types.ts";

export default class DEFENSE_2_ENEMY implements DroneConfig {
  readonly id = "DEFENSE_2_ENEMY";
  readonly title = "Defense Drone Mark II";
  readonly type: DroneConfig["type"] = "DEFENSE";
  readonly power = 3;
  readonly cost = 70;
  readonly cooldown = 0.88;
  readonly speed = 7;
  readonly weapon = "DRONE_LASER_2";
  readonly image = "drone_defense2";
  readonly icon = "defense2";
  readonly rarity = 0;
  readonly antiDrone = false;
}
