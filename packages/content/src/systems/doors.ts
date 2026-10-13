/** The doors system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_doors implements SystemConfig {
  readonly id: SystemConfig["id"] = "doors";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [35, 50];
  readonly cost = 60;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_doors_title", desc: "system_doors_desc" };
}
