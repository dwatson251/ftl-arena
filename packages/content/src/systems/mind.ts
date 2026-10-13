/** The mind system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_mind implements SystemConfig {
  readonly id: SystemConfig["id"] = "mind";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [30, 60];
  readonly cost = 75;
  /** FTL's title and description, from the player's install. */
  readonly text = { title: "system_mind_title", desc: "system_mind_desc" };
}
