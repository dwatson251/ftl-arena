/** The Nesasio (Stealth Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_stealth from "../layouts/stealth.ts";

export default class PLAYER_SHIP_STEALTH implements ShipConfig {
  readonly id = "PLAYER_SHIP_STEALTH";
  readonly title = "The Nesasio";
  readonly className = "Stealth Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 3;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 14, power: 1, start: true, station: 0, img: "room_doors_2", facing: "down" },
    { id: "sensors", room: 13, power: 2, start: true, station: 0, img: "room_sensors_2", facing: "up" },
    { id: "oxygen", room: 1, power: 1, start: true, station: -1, img: "room_oxygen_2" },
    { id: "engines", room: 12, power: 4, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 10, power: 2, start: false, station: 0, img: "room_shields_2", facing: "left" },
    { id: "weapons", room: 3, power: 2, start: true, station: 1, img: "room_weapons_2", facing: "up" },
    { id: "drones", room: 11, power: 2, start: false, station: -1, img: "room_drones_2" },
    { id: "medbay", room: 7, power: 1, start: true, station: 1 },
    { id: "clonebay", room: 7, power: 1, start: false, station: 1 },
    { id: "teleporter", room: 5, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 8, power: 1, start: true, station: -1, img: "room_cloaking_2" },
    { id: "hacking", room: 6, power: 1, start: false, station: -1, img: "room_hacking", facing: "down" },
    { id: "battery", room: 4, power: 1, start: false, station: -1 },
    { id: "mind", room: 9, power: 1, start: false, station: -1, img: "room_mind_2" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "human"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["BEAM_1", "LASER_BURST_2"],
    drones: [],
    augments: ["SYSTEM_CASING", "ADV_SCANNERS"],
    missiles: 0,
    droneParts: 0,
  };
  readonly layout = L_stealth;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "stealth" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
