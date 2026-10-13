/** Lanius. */
import type { CrewConfig } from "../types.ts";

export default class Anaerobic implements CrewConfig {
  readonly id = "anaerobic";
  readonly title = "Lanius";
  readonly cost = 50;
  readonly shirt = 12875240;
  readonly rarity = 0;
  readonly traits: CrewConfig["traits"] = {
    hp: 100,
    speed: 0.8,
    repair: 1,
    combat: 1,
    suffocation: 0,
    drainO2: 1,
    blurb: "Doesn't breathe; drains its room's oxygen like a hull breach. 20% slower.",
  };
}
