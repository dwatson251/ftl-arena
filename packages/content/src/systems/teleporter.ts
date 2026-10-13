/** The teleporter system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_teleporter implements SystemConfig {
  readonly id: SystemConfig["id"] = "teleporter";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [30, 60];
  readonly cost = 90;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Crew Teleporter";
  readonly desc = "Allows you to send your crew-members to board enemy vessels.";
  readonly levels: string[] = ["\\1 sec cooldown", "\\1 sec cooldown", "\\1 sec cooldown"];
}
