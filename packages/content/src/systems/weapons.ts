/** The weapons system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_weapons implements SystemConfig {
  readonly id: SystemConfig["id"] = "weapons";
  readonly maxPower = 8;
  readonly startPower = 4;
  readonly upgradeCost = [40, 25, 35, 50, 75, 90, 100, 120];
  readonly cost = 20;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_weapons_title", desc: "system_weapons_desc" };
}
