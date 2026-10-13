/** The artillery system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_artillery implements SystemConfig {
  readonly id: SystemConfig["id"] = "artillery";
  readonly maxPower = 4;
  readonly startPower = 2;
  readonly upgradeCost = [30, 50, 80];
  readonly cost = 150;
  /** Ours (FTL writes these inline) title and description, and FTL's line for each level ("" where it shows none). */
  readonly title = "Artillery Beam";
  readonly desc = "A slow, heavy beam that ignores shields and hits each room it sweeps for 1 damage. More power charges it faster.";
  readonly levels: string[] = ["50 Second Cooldown", "40 Second Cooldown", "30 Second Cooldown", "20 Second Cooldown"];
}
