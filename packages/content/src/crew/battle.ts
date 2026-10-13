/** Battle. */
import type { CrewConfig } from "../types.ts";

export default class Battle implements CrewConfig {
  readonly id = "battle";
  readonly title = "Battle";
  readonly cost = 50;
  readonly rarity = 0;
  readonly traits: CrewConfig["traits"] = {
    hp: 150,
    speed: 1,
    repair: 0,
    combat: 1,
    suffocation: 0,
    fireImmune: true,
    drone: true,
    blurb: "Anti-personnel drone.",
  };
}
