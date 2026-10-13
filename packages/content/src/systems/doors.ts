/** The doors system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_doors implements SystemConfig {
  readonly id: SystemConfig["id"] = "doors";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [35, 50];
  readonly cost = 60;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Door System";
  readonly desc = "Allows remote opening and closing of doors. Upgrades to Blast Doors that impede fire spread and intruder movement.";
  readonly levels: string[] = ["Normal doors", "Blast Doors", "Improved Blast Doors"];
}
