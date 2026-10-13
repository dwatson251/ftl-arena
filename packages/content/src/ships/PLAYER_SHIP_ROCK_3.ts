/** Tektite (Rock Cruiser · Type C). */
import type { ShipConfig } from "../types.ts";
import L_rock_cruiser_3 from "../layouts/rock_cruiser_3.ts";

export default class PLAYER_SHIP_ROCK_3 implements ShipConfig {
  readonly id = "PLAYER_SHIP_ROCK_3";
  readonly title = "Tektite";
  readonly className = "Rock Cruiser · Type C";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 4, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 6, power: 1, start: true, station: 0, img: "room_doors_8", facing: "left" },
    { id: "sensors", room: 10, power: 1, start: true, station: 1, img: "room_sensors_4", facing: "left" },
    { id: "oxygen", room: 7, power: 1, start: true, station: -1, img: "room_oxygen_13" },
    { id: "engines", room: 8, power: 2, start: true, station: 2, img: "room_engines", facing: "down" },
    { id: "shields", room: 12, power: 2, start: true, station: 2, img: "room_shields_3", facing: "left" },
    { id: "weapons", room: 0, power: 3, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 11, power: 2, start: false, station: -1, img: "room_drones_14" },
    { id: "medbay", room: 13, power: 1, start: false, station: -2, img: "room_medbay_6" },
    { id: "clonebay", room: 13, power: 1, start: true, station: 0 },
    { id: "teleporter", room: 15, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 2, power: 1, start: false, station: -1, img: "room_cloaking_3" },
    { id: "battery", room: 16, power: 1, start: false, station: -1, img: "room_battery_14" },
    { id: "mind", room: 5, power: 1, start: false, station: -1, img: "room_mind_4" },
    { id: "hacking", room: 9, power: 1, start: false, station: -1, img: "room_hacking_7", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["rock", "rock", "crystal"],
    crewCount: 3,
    crewRace: "rock",
    weapons: ["MISSILE_CHARGEGUN", "CRYSTAL_HEAVY_1"],
    drones: [],
    augments: ["ROCK_ARMOR"],
    missiles: 15,
    droneParts: 0,
  };
  readonly layout = L_rock_cruiser_3;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "rock_cruiser_3", floor: "rock_cruiser", shield: "rock_cruiser", cloak: "rock_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
