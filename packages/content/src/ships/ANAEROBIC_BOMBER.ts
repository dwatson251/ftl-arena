/** Lanius Bomber (Lanius Bomber). */
import type { ShipConfig } from "../types.ts";
import L_anaerobic_bomber from "../layouts/anaerobic_bomber.ts";

export default class ANAEROBIC_BOMBER implements ShipConfig {
  readonly id = "ANAEROBIC_BOMBER";
  readonly title = "Lanius Bomber";
  readonly className = "Lanius Bomber";
  readonly health = 9;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 3, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 10, power: 1, start: false, station: 0, max: 3 },
    { id: "clonebay", room: 7, power: 1, start: false, station: 1, max: 3 },
    { id: "shields", room: 0, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 9, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 1, power: 2, start: true, station: 0, max: 8 },
    { id: "mind", room: 4, power: 1, start: false, station: -1, max: 2 },
    { id: "teleporter", room: 8, power: 1, start: true, station: -1, max: 3 },
    { id: "cloaking", room: 2, power: 1, start: false, station: -1, max: 3 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["anaerobic", "anaerobic", "anaerobic"],
    crewCount: 3,
    crewRace: "anaerobic",
    weapons: [],
    drones: [],
    augments: ["O2_MASKS"],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_anaerobic_bomber;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "anaerobic_bomber", cloak: "anaerobic_bomber" };
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
      "SHOTGUN",
      "SHOTGUN_2",
      "ION_2",
      "MISSILES_1",
      "MISSILES_2",
      "MISSILES_3",
      "MISSILES_BREACH",
      "BEAM_1",
      "BEAM_2",
      "BOMB_1",
    ],
    crewMax: 5,
  };
}
