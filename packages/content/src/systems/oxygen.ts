/** The oxygen system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_oxygen implements SystemConfig {
  readonly id: SystemConfig["id"] = "oxygen";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [25, 50, 75];
  readonly cost = 0;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_oxygen_title", desc: "system_oxygen_desc" };
}
