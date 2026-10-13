/** The drones system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_drones implements SystemConfig {
  readonly id: SystemConfig["id"] = "drones";
  readonly maxPower = 8;
  readonly startPower = 2;
  readonly upgradeCost = [10, 20, 30, 45, 60, 80, 100, 120];
  readonly cost = 60;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_drones_title", desc: "system_drones_desc" };
}
