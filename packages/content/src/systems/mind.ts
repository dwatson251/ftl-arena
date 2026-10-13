/** The mind system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_mind implements SystemConfig {
  readonly id: SystemConfig["id"] = "mind";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [30, 60];
  readonly cost = 75;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Mind Control";
  readonly desc = "Temporarily turn enemies into allies.";
  readonly levels: string[] = ["Mind control one person", "Boosts health and damage", "Increases boost"];
}
