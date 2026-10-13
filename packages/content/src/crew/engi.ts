/** Engi. */
import type { CrewConfig } from "../types.ts";

export default class Engi implements CrewConfig {
  readonly id = "engi";
  readonly title = "Engi";
  readonly cost = 50;
  readonly rarity = 2;
  readonly traits: CrewConfig["traits"] = { hp: 100, speed: 1, repair: 2, combat: 0.5, suffocation: 1, blurb: "Repairs and fights fires twice as fast." };
}
