/** The Osprey (Federation Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_fed_cruiser from "../layouts/fed_cruiser.ts";

export default class PLAYER_SHIP_FED implements ShipConfig {
  readonly id = "PLAYER_SHIP_FED";
  readonly title = "The Osprey";
  readonly className = "Federation Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 4, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 8, power: 1, start: true, station: 0, img: "room_doors_5", facing: "right" },
    { id: "sensors", room: 13, power: 1, start: true, station: 1, facing: "down" },
    { id: "oxygen", room: 9, power: 1, start: true, station: -1, img: "room_oxygen_4" },
    { id: "engines", room: 3, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 11, power: 2, start: true, station: 0, img: "room_shields", facing: "left" },
    { id: "weapons", room: 15, power: 2, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 16, power: 2, start: false, station: -1, img: "room_drones_5" },
    { id: "medbay", room: 10, power: 1, start: true, station: 1 },
    { id: "clonebay", room: 10, power: 1, start: false, station: 1 },
    { id: "teleporter", room: 1, power: 1, start: false, station: -1 },
    { id: "artillery", room: 6, power: 1, start: true, station: -1, weapon: "ARTILLERY_FED" },
    { id: "cloaking", room: 12, power: 1, start: false, station: -1, img: "room_cloaking_8" },
    { id: "battery", room: 14, power: 1, start: false, station: -1, img: "room_battery_3" },
    { id: "mind", room: 5, power: 1, start: false, station: -1, img: "room_mind_7" },
    { id: "hacking", room: 2, power: 1, start: false, station: -1, img: "room_hacking_3", facing: "left" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "mantis", "rock", "engi"],
    crewCount: 4,
    crewRace: "human",
    weapons: ["LASER_BURST_3"],
    drones: [],
    augments: [],
    missiles: 5,
    droneParts: 2,
  };
  readonly layout = L_fed_cruiser;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "fed_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
