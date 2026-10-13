/** The cloaking system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_cloaking implements SystemConfig {
  readonly id: SystemConfig["id"] = "cloaking";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [30, 50];
  readonly cost = 150;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Cloaking";
  readonly desc = "Cloaks the ship, adding 60 to your evasion and preventing the enemy ship from locking on with their weapons.";
  readonly levels: string[] = ["Cloak: \\1 seconds", "Cloak: \\1 seconds", "Cloak: \\1 seconds"];
}
