/** The medbay system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_medbay implements SystemConfig {
  readonly id: SystemConfig["id"] = "medbay";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [35, 45];
  readonly cost = 50;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_medbay_title", desc: "system_medbay_desc" };
}
