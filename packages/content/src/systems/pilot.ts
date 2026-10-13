/** The pilot system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_pilot implements SystemConfig {
  readonly id: SystemConfig["id"] = "pilot";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [20, 50];
  readonly cost = 1;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_pilot_title", desc: "system_pilot_desc" };
}
