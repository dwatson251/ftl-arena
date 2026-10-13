/** Bulwark (Rock Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_rock_cruiser from "../layouts/rock_cruiser.ts";

export default class PLAYER_SHIP_ROCK implements ShipConfig {
  readonly id = "PLAYER_SHIP_ROCK";
  readonly title = "Bulwark";
  readonly className = "Rock Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 5, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 1, power: 1, start: true, station: 0, img: "room_doors_5", facing: "right" },
    { id: "sensors", room: 12, power: 1, start: true, station: 1, img: "room_sensors_4", facing: "left" },
    { id: "oxygen", room: 0, power: 1, start: true, station: -1, img: "room_oxygen_7" },
    { id: "engines", room: 14, power: 2, start: true, station: 2, img: "room_engines", facing: "down" },
    { id: "shields", room: 2, power: 2, start: true, station: 0, img: "room_shields_4", facing: "left" },
    { id: "weapons", room: 15, power: 3, start: true, station: 1, img: "room_weapons_5", facing: "right" },
    { id: "drones", room: 4, power: 2, start: false, station: -1, img: "room_drones_7" },
    { id: "medbay", room: 16, power: 1, start: true, station: 2, img: "room_medbay_7" },
    { id: "clonebay", room: 16, power: 1, start: false, station: 2 },
    { id: "teleporter", room: 17, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 3, power: 1, start: false, station: -1 },
    { id: "battery", room: 13, power: 1, start: false, station: -1, img: "room_battery_10" },
    { id: "mind", room: 8, power: 1, start: false, station: -1, img: "room_mind_3" },
    { id: "hacking", room: 11, power: 1, start: false, station: -1, img: "room_hacking_4", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["rock", "rock", "rock"],
    crewCount: 3,
    crewRace: "rock",
    weapons: ["MISSILES_2_PLAYER", "MISSILES_HULL"],
    drones: [],
    augments: ["ROCK_ARMOR"],
    missiles: 28,
    droneParts: 0,
  };
  readonly layout = L_rock_cruiser;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "rock_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
