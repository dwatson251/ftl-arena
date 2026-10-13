/** The sensors system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_sensors implements SystemConfig {
  readonly id: SystemConfig["id"] = "sensors";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [25, 40];
  readonly cost = 40;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_sensors_title", desc: "system_sensors_desc" };
}
