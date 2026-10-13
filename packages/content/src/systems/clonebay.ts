/** The clonebay system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_clonebay implements SystemConfig {
  readonly id: SystemConfig["id"] = "clonebay";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [35, 45];
  readonly cost = 50;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_clonebay_title", desc: "system_clonebay_desc" };
}
