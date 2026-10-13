/** The medbay system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_medbay implements SystemConfig {
  readonly id: SystemConfig["id"] = "medbay";
  readonly maxPower = 3;
  readonly startPower = 1;
  readonly upgradeCost = [35, 45];
  readonly cost = 50;
  /** FTL's title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Medbay";
  readonly desc = "Heals all crew-members within the Medbay room. Upgrading increases healing speed.";
  readonly levels: string[] = ["Healing Boost: \\1x", "Healing Boost: \\1x", "Healing Boost: \\1x"];
}
