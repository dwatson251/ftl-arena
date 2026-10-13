/** The sensors system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_sensors implements SystemConfig {
  readonly id: SystemConfig["id"] = "sensors";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [25, 40];
  readonly cost = 40;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Sensors";
  readonly desc = "Reveals the interior of your ship and gives information about enemy ships.";
  readonly levels: string[] = ["See ship interior", "See enemy interior", "See enemy weapon charge"];
}
