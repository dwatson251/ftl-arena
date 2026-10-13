/** Rock Scout (Rock Scout). */
import type { ShipConfig } from "../types.ts";
import L_rock_scout from "../layouts/rock_scout.ts";

export default class ROCK_SCOUT implements ShipConfig {
  readonly id = "ROCK_SCOUT";
  readonly title = "Rock Scout";
  readonly className = "Rock Scout";
  readonly health = 8;
  readonly reactor = 10;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 3, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 5, power: 1, start: false, station: 0, max: 3 },
    { id: "oxygen", room: 0, power: 1, start: true, station: -1, max: 3 },
    { id: "medbay", room: 2, power: 1, start: false, station: 1, max: 3 },
    { id: "shields", room: 4, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 6, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 1, power: 2, start: true, station: 0, max: 8 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["rock", "rock"],
    crewCount: 2,
    crewRace: "rock",
    weapons: [],
    drones: [],
    augments: ["ROCK_ARMOR"],
    missiles: 6,
    droneParts: 0,
  };
  readonly layout = L_rock_scout;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "rock_scout", cloak: "rock_scout" };
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
      "ION_2",
    ],
    crewMax: 5,
  };
}
