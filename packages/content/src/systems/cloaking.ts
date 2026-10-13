/** The cloaking system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_cloaking implements SystemConfig {
  readonly id: SystemConfig["id"] = "cloaking";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [30, 50];
  readonly cost = 150;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_cloaking_title", desc: "system_cloaking_desc" };
}
