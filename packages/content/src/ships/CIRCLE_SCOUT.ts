/** Engi Scout (Engi Scout). */
import type { ShipConfig } from "../types.ts";
import L_circle_scout from "../layouts/circle_scout.ts";

export default class CIRCLE_SCOUT implements ShipConfig {
  readonly id = "CIRCLE_SCOUT";
  readonly title = "Engi Scout";
  readonly className = "Engi Scout";
  readonly health = 7;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 5, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 2, power: 1, start: false, station: 0, max: 3 },
    { id: "medbay", room: 6, power: 1, start: false, station: 1, max: 3 },
    { id: "oxygen", room: 3, power: 1, start: true, station: -1, max: 3 },
    { id: "shields", room: 1, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 7, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 4, power: 2, start: true, station: 0, max: 8 },
    { id: "drones", room: 0, power: 2, start: true, station: -1, max: 8 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["engi", "engi"],
    crewCount: 2,
    crewRace: "engi",
    weapons: [],
    drones: [],
    augments: ["NANO_MEDBAY"],
    missiles: 6,
    droneParts: 4,
  };
  readonly layout = L_circle_scout;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "circle_scout", cloak: "circle_scout" };
  readonly enemy: ShipConfig["enemy"] = {
    scale: 1,
    single: true,
    weaponPool: [
      "LASER_BURST_1",
      "LASER_BURST_2_A",
      "LASER_BURST_3",
      "LASER_HEAVY_1",
      "BEAM_1",
      "BEAM_2",
      "BEAM_3",
      "BEAM_LONG",
      "BEAM_FIRE",
      "ION_1",
      "ION_2",
      "ION_4",
    ],
    crewMax: 5,
  };
}
