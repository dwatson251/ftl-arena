/** Slug. */
import type { CrewConfig } from "../types.ts";

export default class Slug implements CrewConfig {
  readonly id = "slug";
  readonly title = "Slug";
  readonly cost = 45;
  readonly shirt = 16770735;
  readonly rarity = 0;
  readonly traits: CrewConfig["traits"] = {
    hp: 100,
    speed: 1,
    repair: 1,
    combat: 1,
    suffocation: 1,
    telepathic: true,
    blurb: "Telepathic: sees enemy crew without sensors.",
  };
}
