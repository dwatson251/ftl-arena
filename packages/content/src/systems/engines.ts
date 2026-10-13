/** The engines system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_engines implements SystemConfig {
  readonly id: SystemConfig["id"] = "engines";
  readonly maxPower = 8;
  readonly startPower = 2;
  readonly upgradeCost = [10, 15, 30, 40, 60, 80, 120, 150];
  readonly cost = 1;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_engines_title", desc: "system_engines_desc" };
}
