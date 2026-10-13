/** Repair. */
import type { CrewConfig } from "../types.ts";

export default class Repair implements CrewConfig {
  readonly id = "repair";
  readonly title = "Repair";
  readonly cost = 50;
  readonly rarity = 0;
  readonly traits: CrewConfig["traits"] = {
    hp: 70,
    speed: 1,
    repair: 1,
    combat: 0,
    suffocation: 0,
    fireImmune: true,
    drone: true,
    blurb: "System repair drone.",
  };
}
