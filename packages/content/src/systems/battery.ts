/** The battery system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_battery implements SystemConfig {
  readonly id: SystemConfig["id"] = "battery";
  readonly maxPower = 2;
  readonly startPower = 1;
  readonly upgradeCost = [50];
  readonly cost = 35;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Backup Battery";
  readonly desc = "Provides a 30 second power boost to your Reactor. Upgrading increases the boost amount.";
  readonly levels: string[] = ["Provides \\1 bonus power", "Provides \\1 bonus power"];
}
