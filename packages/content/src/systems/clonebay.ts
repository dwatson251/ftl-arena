/** The clonebay system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_clonebay implements SystemConfig {
  readonly id: SystemConfig["id"] = "clonebay";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [35, 45];
  readonly cost = 50;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Clone Bay";
  readonly desc = "Automatically clones dead crew with skill penalty. Taking advantage of micro-cloning, crew heals partially every jump. Jump heal is passive and requires no power.";
  readonly levels: string[] = ["\\1 sec clone", "\\1 sec clone", "\\1 sec clone"];
}
