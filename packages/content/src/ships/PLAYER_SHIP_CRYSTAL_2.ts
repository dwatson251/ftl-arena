/** Carnelian (Crystal Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_crystal_cruiser_2 from "../layouts/crystal_cruiser_2.ts";

export default class PLAYER_SHIP_CRYSTAL_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_CRYSTAL_2";
  readonly title = "Carnelian";
  readonly className = "Crystal Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 15, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 14, power: 1, start: true, station: 1, img: "room_doors_7", facing: "up" },
    { id: "sensors", room: 10, power: 1, start: true, station: 0, img: "room_sensors_2", facing: "up" },
    { id: "oxygen", room: 8, power: 1, start: true, station: -1, img: "room_oxygen_7" },
    { id: "engines", room: 2, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 1, power: 2, start: true, station: 1, img: "room_shields_7", facing: "up" },
    { id: "weapons", room: 4, power: 1, start: true, station: 1, img: "room_weapons_7", facing: "up" },
    { id: "drones", room: 13, power: 2, start: false, station: -1, img: "room_drones_5" },
    { id: "medbay", room: 9, power: 1, start: true, station: 0, img: "room_medbay_4" },
    { id: "clonebay", room: 9, power: 1, start: false, station: 0 },
    { id: "teleporter", room: 3, power: 1, start: true, station: -1 },
    { id: "cloaking", room: 7, power: 1, start: true, station: -1 },
    { id: "battery", room: 12, power: 1, start: false, station: -1, img: "room_battery_13" },
    { id: "mind", room: 0, power: 1, start: false, station: -1, img: "room_mind_11" },
    { id: "hacking", room: 5, power: 1, start: false, station: -1, img: "room_hacking_2", facing: "down" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["crystal", "crystal", "crystal"],
    crewCount: 3,
    crewRace: "crystal",
    weapons: [],
    drones: [],
    augments: ["CRYSTAL_SHARDS"],
    missiles: 0,
    droneParts: 0,
  };
  readonly layout = L_crystal_cruiser_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "crystal_cruiser_2", shield: "crystal_cruiser", cloak: "crystal_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
