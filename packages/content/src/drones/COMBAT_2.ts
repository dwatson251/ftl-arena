/** Combat Drone Mark II. */
import type { DroneConfig } from "../types.ts";

export default class COMBAT_2 implements DroneConfig {
  readonly id = "COMBAT_2";
  readonly title = "Combat Drone Mark II";
  readonly type: DroneConfig["type"] = "COMBAT";
  readonly power = 4;
  readonly cost = 75;
  readonly cooldown = 1;
  readonly speed = 28;
  readonly weapon = "DRONE_LASER";
  readonly image = "drone_combat2";
  readonly icon = "combat2";
  readonly rarity = 5;
  readonly antiDrone = false;
}
