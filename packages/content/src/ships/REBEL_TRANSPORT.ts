/** Rebel Transport (Rebel Transport). */
import type { ShipConfig } from "../types.ts";
import L_rebel_squat from "../layouts/rebel_squat.ts";

export default class REBEL_TRANSPORT implements ShipConfig {
  readonly id = "REBEL_TRANSPORT";
  readonly title = "Rebel Transport";
  readonly className = "Rebel Transport";
  readonly health = 9;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 1, start: true, station: 0, max: 2 },
    { id: "oxygen", room: 2, power: 1, start: true, station: -1, max: 2 },
    { id: "shields", room: 4, power: 2, start: true, station: 0, max: 10 },
    { id: "engines", room: 7, power: 2, start: true, station: 0, max: 4 },
    { id: "weapons", room: 6, power: 1, start: true, station: 0, max: 6 },
    { id: "drones", room: 1, power: 2, start: true, station: -1, max: 8 },
    { id: "medbay", room: 3, power: 1, start: false, station: 1, max: 3 },
    { id: "doors", room: 5, power: 1, start: false, station: 0, max: 3 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "human"],
    crewCount: 3,
    crewRace: "human",
    weapons: [],
    drones: [],
    augments: [],
    missiles: 10,
    droneParts: 4,
  };
  readonly layout = L_rebel_squat;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "rebel_squat", cloak: "rebel_squat" };
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
    crewMax: 4,
  };
}
