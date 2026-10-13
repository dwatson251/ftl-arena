/** Shivan (Rock Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_rock_cruiser_2 from "../layouts/rock_cruiser_2.ts";

export default class PLAYER_SHIP_ROCK_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_ROCK_2";
  readonly title = "Shivan";
  readonly className = "Rock Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 1, img: "room_pilot_2", facing: "right" },
    { id: "doors", room: 15, power: 1, start: false, station: 0, img: "room_doors_5", facing: "right" },
    { id: "sensors", room: 3, power: 1, start: true, station: 1, img: "room_sensors_6", facing: "right" },
    { id: "oxygen", room: 4, power: 2, start: true, station: -1, img: "room_oxygen_6" },
    { id: "engines", room: 0, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 2, power: 2, start: true, station: 0, img: "room_shields_4", facing: "left" },
    { id: "weapons", room: 12, power: 3, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 14, power: 2, start: false, station: -1, img: "room_drones_9" },
    { id: "medbay", room: 1, power: 1, start: true, station: 1 },
    { id: "clonebay", room: 1, power: 1, start: false, station: 1 },
    { id: "teleporter", room: 10, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 13, power: 1, start: false, station: -1, img: "room_cloaking_2" },
    { id: "battery", room: 7, power: 1, start: false, station: -1, img: "room_battery_2" },
    { id: "mind", room: 6, power: 1, start: false, station: -1, img: "room_mind_8" },
    { id: "hacking", room: 11, power: 1, start: false, station: -1, img: "room_hacking_3", facing: "left" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["rock", "rock", "rock", "rock"],
    crewCount: 4,
    crewRace: "rock",
    weapons: ["LASER_HEAVY_1_SP", "BOMB_FIRE", "BOMB_1"],
    drones: [],
    augments: ["ROCK_ARMOR"],
    missiles: 18,
    droneParts: 0,
  };
  readonly layout = L_rock_cruiser_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "rock_cruiser_2", shield: "rock_cruiser", cloak: "rock_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
