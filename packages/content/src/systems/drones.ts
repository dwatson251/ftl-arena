/** The drones system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_drones implements SystemConfig {
  readonly id: SystemConfig["id"] = "drones";
  readonly maxPower = 8;
  readonly startPower = 2;
  readonly upgradeCost = [10, 20, 30, 45, 60, 80, 100, 120];
  readonly cost = 60;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Drone Control";
  readonly desc = "Powers all of the ship's drones. Drones are automated robots that perform tasks like attacking enemy ships or repairing systems.";
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
