/** The engines system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_engines implements SystemConfig {
  readonly id: SystemConfig["id"] = "engines";
  readonly maxPower = 8;
  readonly startPower = 2;
  readonly upgradeCost = [10, 15, 30, 40, 60, 80, 120, 150];
  readonly cost = 1;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Engines";
  readonly desc = "Powers the FTL drive and allows the ship to dodge. Upgrading improves dodge chance and the rate that your FTL drive charges.";
  readonly levels: string[] = [
    "Dodge: \\1 / FTL: \\2x",
    "Dodge: \\1 / FTL: \\2x",
    "Dodge: \\1 / FTL: \\2x",
    "Dodge: \\1 / FTL: \\2x",
    "Dodge: \\1 / FTL: \\2x",
    "Dodge: \\1 / FTL: \\2x",
    "Dodge: \\1 / FTL: \\2x",
    "Dodge: \\1 / FTL: \\2x",
  ];
}
