/** Anti-Ship Beam Drone II. */
import type { DroneConfig } from "../types.ts";

export default class COMBAT_BEAM_2 implements DroneConfig {
  readonly id = "COMBAT_BEAM_2";
  readonly title = "Anti-Ship Beam Drone II";
  readonly type: DroneConfig["type"] = "COMBAT";
  readonly power = 3;
  readonly cost = 60;
  readonly cooldown = 1;
  readonly speed = 11;
  readonly weapon = "DRONE_BEAM2";
  readonly image = "drone_beam_2";
  readonly icon = "beam2";
  readonly rarity = 5;
  readonly antiDrone = false;
}
