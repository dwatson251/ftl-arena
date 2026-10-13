/** Energy Bomber (Energy Bomber). */
import type { ShipConfig } from "../types.ts";
import L_energy_bomber from "../layouts/energy_bomber.ts";

export default class ZOLTAN_BOMBER implements ShipConfig {
  readonly id = "ZOLTAN_BOMBER";
  readonly title = "Energy Bomber";
  readonly className = "Energy Bomber";
  readonly health = 7;
  readonly reactor = 9;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 1, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 2, power: 1, start: false, station: 0, max: 3 },
    { id: "medbay", room: 6, power: 1, start: false, station: 1, max: 3 },
    { id: "oxygen", room: 5, power: 1, start: true, station: -1, max: 3 },
    { id: "shields", room: 3, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 7, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 4, power: 2, start: true, station: 0, max: 8 },
    { id: "drones", room: 0, power: 2, start: false, station: -1, max: 4 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["energy", "energy", "energy"],
    crewCount: 3,
    crewRace: "energy",
    weapons: [],
    drones: [],
    augments: ["ENERGY_SHIELD"],
    missiles: 10,
    droneParts: 2,
  };
  readonly layout = L_energy_bomber;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "energy_bomber", cloak: "energy_bomber" };
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
      "BEAM_1",
      "BEAM_2",
      "BEAM_3",
      "BEAM_LONG",
      "BEAM_FIRE",
      "ION_1",
      "ION_2",
      "BOMB_1",
      "BOMB_ION",
      "BEAM_HULL",
    ],
    crewMax: 6,
  };
}
