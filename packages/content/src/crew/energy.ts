/** Zoltan. */
import type { CrewConfig } from "../types.ts";

export default class Energy implements CrewConfig {
  readonly id = "energy";
  readonly title = "Zoltan";
  readonly cost = 60;
  readonly shirt = 16383891;
  readonly rarity = 5;
  readonly traits: CrewConfig["traits"] = {
    hp: 70,
    speed: 1,
    repair: 1,
    combat: 1,
    suffocation: 1,
    power: 1,
    blurb: "Powers the system it stands in by 1. 70 HP.",
  };
}
