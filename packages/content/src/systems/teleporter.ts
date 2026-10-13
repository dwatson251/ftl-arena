/** The teleporter system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_teleporter implements SystemConfig {
  readonly id: SystemConfig["id"] = "teleporter";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [30, 60];
  readonly cost = 90;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_teleporter_title", desc: "system_teleporter_desc" };
}
