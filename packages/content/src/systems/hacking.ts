/** The hacking system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_hacking implements SystemConfig {
  readonly id: SystemConfig["id"] = "hacking";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [35, 60];
  readonly cost = 80;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Hacking";
  readonly desc = "Targets a single system, locking its doors and granting the ability to temporarily disable or disrupt it. Requires drone part to launch.";
  readonly levels: string[] = ["\\1 second disruption", "\\1 second disruption", "\\1 second disruption"];
}
