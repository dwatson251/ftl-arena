/** Rebel Fighter (Rebel Fighter). */
import type { ShipConfig } from "../types.ts";
import L_rebel_long from "../layouts/rebel_long.ts";

export default class REBEL_SKINNY implements ShipConfig {
  readonly id = "REBEL_SKINNY";
  readonly title = "Rebel Fighter";
  readonly className = "Rebel Fighter";
  readonly health = 10;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "oxygen", room: 2, power: 1, start: true, station: -1, max: 2 },
    { id: "pilot", room: 0, power: 1, start: true, station: 0, max: 3 },
    { id: "shields", room: 6, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 5, power: 2, start: true, station: 0, max: 5 },
    { id: "weapons", room: 4, power: 2, start: true, station: 0, max: 8 },
    { id: "medbay", room: 3, power: 1, start: false, station: 1, max: 2 },
    { id: "teleporter", room: 1, power: 1, start: false, station: -1, max: 1 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "human"],
    crewCount: 3,
    crewRace: "human",
    weapons: [],
    drones: [],
    augments: [],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_rebel_long;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "rebel_long", cloak: "rebel_long" };
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
