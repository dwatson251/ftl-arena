/** The artillery system. */
import type { SystemConfig } from "../types.ts";

export default class Sys_artillery implements SystemConfig {
  readonly id: SystemConfig["id"] = "artillery";
  readonly maxPower = 4;
  readonly startPower = 2;
  readonly upgradeCost = [30, 50, 80];
  readonly cost = 150;
  /** FTL writes these inline (no text ids); ours. */
  readonly title = "Artillery Beam";
  readonly desc = "A slow, heavy beam that ignores shields and hits each room it sweeps for 1 damage. More power charges it faster.";
}
