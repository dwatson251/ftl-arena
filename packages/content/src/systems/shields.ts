/** The shields system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_shields implements SystemConfig {
  readonly id: SystemConfig["id"] = "shields";
  readonly maxPower = 8;
  readonly startPower = 2;
  readonly upgradeCost = [100, 20, 30, 40, 60, 80, 100, 120];
  readonly cost = 125;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Shields";
  readonly desc = "Powers your shields. Each additional barrier can block one shot.";
  readonly levels: string[] = ["", "One Shield Barrier", "", "Two Shield Barriers", "", "Three Shield Barriers", "", "Four Shield Barriers"];
}
