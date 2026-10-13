/** Mantis Fighter (Mantis Fighter). */
import type { ShipConfig } from "../types.ts";
import L_mantis_fighter from "../layouts/mantis_fighter.ts";

export default class MANTIS_FIGHTER implements ShipConfig {
  readonly id = "MANTIS_FIGHTER";
  readonly title = "Mantis Fighter";
  readonly className = "Mantis Fighter";
  readonly health = 9;
  readonly reactor = 11;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 9, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 2, power: 1, start: false, station: 0, max: 3 },
    { id: "oxygen", room: 5, power: 1, start: true, station: -1, max: 3 },
    { id: "medbay", room: 8, power: 1, start: true, station: 1, max: 3 },
    { id: "teleporter", room: 4, power: 1, start: true, station: -1, max: 3 },
    { id: "shields", room: 0, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 7, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 3, power: 1, start: true, station: 0, max: 8 },
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
  readonly layout = L_mantis_fighter;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "mantis_fighter", cloak: "mantis_fighter" };
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
