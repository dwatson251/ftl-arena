/** The hacking system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_hacking implements SystemConfig {
  readonly id: SystemConfig["id"] = "hacking";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [35, 60];
  readonly cost = 80;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_hacking_title", desc: "system_hacking_desc" };
}
