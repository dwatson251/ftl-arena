/** Mantis. */
import type { CrewConfig } from "../types.ts";

export default class Mantis implements CrewConfig {
  readonly id = "mantis";
  readonly title = "Mantis";
  readonly cost = 55;
  readonly shirt = 7841069;
  readonly rarity = 2;
  readonly traits: CrewConfig["traits"] = { hp: 100, speed: 1.2, repair: 0.5, combat: 1.5, suffocation: 1, blurb: "Fast; repairs at half speed." };
}
