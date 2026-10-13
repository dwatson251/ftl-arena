/** Bravais (Crystal Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_crystal_cruiser from "../layouts/crystal_cruiser.ts";

export default class PLAYER_SHIP_CRYSTAL implements ShipConfig {
  readonly id = "PLAYER_SHIP_CRYSTAL";
  readonly title = "Bravais";
  readonly className = "Crystal Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 16, power: 1, start: true, station: 0, img: "room_doors_8", facing: "left" },
    { id: "sensors", room: 3, power: 1, start: true, station: 0, img: "room_sensors_2", facing: "up" },
    { id: "oxygen", room: 7, power: 1, start: true, station: -1, img: "room_oxygen_10" },
    { id: "engines", room: 0, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 6, power: 2, start: true, station: 0, img: "room_shields_2", facing: "left" },
    { id: "weapons", room: 17, power: 3, start: true, station: 1, img: "room_weapons_7", facing: "up" },
    { id: "drones", room: 1, power: 2, start: false, station: -1, img: "room_drones_7" },
    { id: "medbay", room: 13, power: 1, start: true, station: 3, img: "room_medbay_3" },
    { id: "clonebay", room: 13, power: 1, start: false, station: 3 },
    { id: "teleporter", room: 15, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 9, power: 1, start: false, station: -1, img: "room_cloaking_2" },
    { id: "battery", room: 12, power: 1, start: false, station: -1, img: "room_battery_3" },
    { id: "mind", room: 2, power: 1, start: false, station: -1, img: "room_mind_10" },
    { id: "hacking", room: 14, power: 1, start: false, station: -1, img: "room_hacking_6", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "crystal", "crystal"],
    crewCount: 4,
    crewRace: "human",
    weapons: ["CRYSTAL_BURST_1", "CRYSTAL_HEAVY_1"],
    drones: [],
    augments: ["CRYSTAL_SHARDS"],
    missiles: 0,
    droneParts: 0,
  };
  readonly layout = L_crystal_cruiser;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "crystal_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
