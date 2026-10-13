/** The oxygen system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_oxygen implements SystemConfig {
  readonly id: SystemConfig["id"] = "oxygen";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [25, 50, 75];
  readonly cost = 0;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Oxygen";
  readonly desc = "Refills the oxygen in the ship. Upgrading increases the rate of refill.";
  readonly levels: string[] = ["O2 Refill Boost: \\1x", "O2 Refill Boost: \\1x", "O2 Refill Boost: \\1x"];
}
