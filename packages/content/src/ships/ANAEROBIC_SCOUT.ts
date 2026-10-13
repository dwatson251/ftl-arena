/** Lanius Scout (Lanius Scout). */
import type { ShipConfig } from "../types.ts";
import L_anaerobic_scout from "../layouts/anaerobic_scout.ts";

export default class ANAEROBIC_SCOUT implements ShipConfig {
  readonly id = "ANAEROBIC_SCOUT";
  readonly title = "Lanius Scout";
  readonly className = "Lanius Scout";
  readonly health = 7;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 1, power: 1, start: true, station: 0, max: 3 },
    { id: "clonebay", room: 3, power: 1, start: false, station: 1, max: 3 },
    { id: "shields", room: 5, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 6, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 4, power: 2, start: true, station: 0, max: 8 },
    { id: "doors", room: 0, power: 1, start: false, station: 0, max: 3 },
    { id: "hacking", room: 2, power: 1, start: false, station: -1, max: 3 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["anaerobic", "anaerobic"],
    crewCount: 2,
    crewRace: "anaerobic",
    weapons: [],
    drones: [],
    augments: ["O2_MASKS"],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_anaerobic_scout;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "anaerobic_scout", cloak: "anaerobic_scout" };
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
    crewMax: 3,
  };
}
