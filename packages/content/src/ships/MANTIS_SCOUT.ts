/** Mantis Scout (Mantis Scout). */
import type { ShipConfig } from "../types.ts";
import L_mantis_scout from "../layouts/mantis_scout.ts";

export default class MANTIS_SCOUT implements ShipConfig {
  readonly id = "MANTIS_SCOUT";
  readonly title = "Mantis Scout";
  readonly className = "Mantis Scout";
  readonly health = 7;
  readonly reactor = 10;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 1, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 2, power: 1, start: false, station: 0, max: 3 },
    { id: "oxygen", room: 5, power: 1, start: true, station: -1, max: 3 },
    { id: "medbay", room: 6, power: 1, start: false, station: 1, max: 3 },
    { id: "teleporter", room: 4, power: 1, start: false, station: -1, max: 3 },
    { id: "shields", room: 0, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 7, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 3, power: 2, start: true, station: 0, max: 7 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["mantis", "mantis", "mantis"],
    crewCount: 3,
    crewRace: "mantis",
    weapons: [],
    drones: [],
    augments: [],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_mantis_scout;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "mantis_scout", cloak: "mantis_scout" };
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
      "BOMB_FIRE",
      "BOMB_ION",
    ],
    crewMax: 5,
  };
}
