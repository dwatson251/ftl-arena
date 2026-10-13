/** Human. */
import type { CrewConfig } from "../types.ts";

export default class Human implements CrewConfig {
  readonly id = "human";
  readonly title = "Human";
  readonly cost = 45;
  readonly shirt = 9211135;
  readonly rarity = 1;
  readonly traits: CrewConfig["traits"] = { hp: 100, speed: 1, repair: 1, combat: 1, suffocation: 1, blurb: "Balanced." };
}
