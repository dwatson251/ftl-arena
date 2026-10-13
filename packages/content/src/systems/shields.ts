/** The shields system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_shields implements SystemConfig {
  readonly id: SystemConfig["id"] = "shields";
  readonly maxPower = 8;
  readonly startPower = 2;
  readonly upgradeCost = [100, 20, 30, 40, 60, 80, 100, 120];
  readonly cost = 125;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_shields_title", desc: "system_shields_desc" };
}
