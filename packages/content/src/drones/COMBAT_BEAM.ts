/** Anti-Ship Beam Drone I. */
import type { DroneConfig } from "../types.ts";

export default class COMBAT_BEAM implements DroneConfig {
  readonly id = "COMBAT_BEAM";
  readonly title = "Anti-Ship Beam Drone I";
  readonly type: DroneConfig["type"] = "COMBAT";
  readonly power = 2;
  readonly cost = 50;
  readonly cooldown = 1;
  readonly speed = 15;
  readonly weapon = "DRONE_BEAM";
  readonly image = "drone_beam";
  readonly icon = "beam";
  readonly rarity = 3;
  readonly antiDrone = false;
}
