/** Federation Bomber (Federation Bomber). */
import type { ShipConfig } from "../types.ts";
import L_fed_bomber from "../layouts/fed_bomber.ts";

export default class FED_BOMBER implements ShipConfig {
  readonly id = "FED_BOMBER";
  readonly title = "Federation Bomber";
  readonly className = "Federation Bomber";
  readonly health = 9;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 2, power: 1, start: false, station: 0, max: 3 },
    { id: "medbay", room: 8, power: 1, start: false, station: 1, max: 3 },
    { id: "oxygen", room: 5, power: 1, start: true, station: -1, max: 3 },
    { id: "shields", room: 1, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 9, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 6, power: 2, start: true, station: 0, max: 8 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human"],
    crewCount: 2,
    crewRace: "human",
    weapons: [],
    drones: [],
    augments: [],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_fed_bomber;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "fed_bomber", cloak: "fed_bomber" };
  readonly enemy: ShipConfig["enemy"] = {
    scale: 1,
    single: true,
    weaponPool: [
      "LASER_BURST_1",
      "LASER_BURST_2_A",
      "LASER_BURST_3",
      "LASER_BURST_5",
      "LASER_HEAVY_1",
      "LASER_HEAVY_2",
      "MISSILES_1",
      "MISSILES_2",
      "MISSILES_3",
      "MISSILES_BREACH",
      "BEAM_1",
      "BEAM_2",
      "BOMB_1",
    ],
    crewMax: 6,
  };
}
