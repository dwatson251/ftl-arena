/** The pilot system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_pilot implements SystemConfig {
  readonly id: SystemConfig["id"] = "pilot";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [20, 50];
  readonly cost = 1;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Piloting";
  readonly desc = "Allows the ship to make FTL jumps and dodge when piloted. Upgrading adds auto-pilot that allows some evasion even without a pilot.";
  readonly levels: string[] = ["Needs pilot to function", "Auto: 50 percent evasion", "Auto: 80 percent evasion"];
}
