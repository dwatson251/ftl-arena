/** Crystal. */
import type { CrewConfig } from "../types.ts";

export default class Crystal implements CrewConfig {
  readonly id = "crystal";
  readonly title = "Crystal";
  readonly cost = 60;
  readonly shirt = 2669567;
  readonly rarity = 0;
  readonly traits: CrewConfig["traits"] = { hp: 125, speed: 0.8, repair: 1, combat: 1, suffocation: 0.5, blurb: "125 HP, half suffocation damage, slow." };
}
