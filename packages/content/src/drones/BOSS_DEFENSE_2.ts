/** Defense Drone Mark II. */
import type { DroneConfig } from "../types.ts";

export default class BOSS_DEFENSE_2 implements DroneConfig {
  readonly id = "BOSS_DEFENSE_2";
  readonly title = "Defense Drone Mark II";
  readonly type: DroneConfig["type"] = "DEFENSE";
  readonly power = 2;
  readonly cost = 75;
  readonly cooldown = 0.75;
  readonly speed = 7;
  readonly weapon = "DRONE_LASER";
  readonly image = "drone_defense2";
  readonly icon = "";
  readonly rarity = 0;
  readonly antiDrone = false;
}
