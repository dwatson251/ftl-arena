/** Anti-Ship Missile Drone I. */
import type { DroneConfig } from "../types.ts";

export default class COMBAT_MISSILE implements DroneConfig {
  readonly id = "COMBAT_MISSILE";
  readonly title = "Anti-Ship Missile Drone I";
  readonly type: DroneConfig["type"] = "COMBAT";
  readonly power = 2;
  readonly cost = 50;
  readonly cooldown = 1;
  readonly speed = 5;
  readonly weapon = "DRONE_MISSILE";
  readonly image = "drone_combat";
  readonly icon = "";
  readonly rarity = 0;
  readonly antiDrone = false;
}
