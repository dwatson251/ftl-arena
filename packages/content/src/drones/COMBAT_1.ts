/** Combat Drone Mark I. */
import type { DroneConfig } from "../types.ts";

export default class COMBAT_1 implements DroneConfig {
  readonly id = "COMBAT_1";
  readonly title = "Combat Drone Mark I";
  readonly type: DroneConfig["type"] = "COMBAT";
  readonly power = 2;
  readonly cost = 50;
  readonly cooldown = 1;
  readonly speed = 15;
  readonly weapon = "DRONE_LASER";
  readonly image = "drone_combat";
  readonly icon = "combat";
  readonly rarity = 2;
  readonly antiDrone = false;
}
