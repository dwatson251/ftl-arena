/** The battery system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_battery implements SystemConfig {
  readonly id: SystemConfig["id"] = "battery";
  readonly maxPower = 2;
  readonly startPower = 1;
  readonly upgradeCost = [50];
  readonly cost = 35;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_battery_title", desc: "system_battery_desc" };
}
