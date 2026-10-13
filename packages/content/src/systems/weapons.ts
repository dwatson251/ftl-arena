/** The weapons system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_weapons implements SystemConfig {
  readonly id: SystemConfig["id"] = "weapons";
  readonly maxPower = 8;
  readonly startPower = 4;
  readonly upgradeCost = [40, 25, 35, 50, 75, 90, 100, 120];
  readonly cost = 20;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Weapon Control";
  readonly desc = "Powers all of the ship's weapons. Upgrading lets you power more weapons.";
  readonly levels: string[] = [
    "",
    "More System Power",
    "More System Power",
    "More System Power",
    "More System Power",
    "More System Power",
    "More System Power",
    "More System Power",
  ];
}
