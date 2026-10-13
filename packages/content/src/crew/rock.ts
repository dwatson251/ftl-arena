/** Rockman. */
import type { CrewConfig } from "../types.ts";

export default class Rock implements CrewConfig {
  readonly id = "rock";
  readonly title = "Rockman";
  readonly cost = 55;
  readonly shirt = 4991519;
  readonly rarity = 3;
  readonly traits: CrewConfig["traits"] = {
    hp: 150,
    speed: 0.5,
    repair: 1,
    combat: 1,
    fireImmune: true,
    suffocation: 1,
    blurb: "150 HP, immune to fire, slow.",
  };
}
