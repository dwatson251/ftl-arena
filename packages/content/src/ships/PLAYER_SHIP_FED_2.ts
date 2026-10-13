/** Nisos (Federation Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_fed_cruiser_2 from "../layouts/fed_cruiser_2.ts";

export default class PLAYER_SHIP_FED_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_FED_2";
  readonly title = "Nisos";
  readonly className = "Federation Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 9;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 7, power: 1, start: true, station: 1, img: "room_pilot_3", facing: "right" },
    { id: "doors", room: 17, power: 1, start: true, station: 0, img: "room_doors_2", facing: "down" },
    { id: "sensors", room: 0, power: 1, start: true, station: 1, facing: "down" },
    { id: "oxygen", room: 8, power: 1, start: true, station: -1, img: "room_oxygen_9" },
    { id: "engines", room: 15, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 14, power: 2, start: true, station: 1, img: "room_shields_7", facing: "up" },
    { id: "weapons", room: 4, power: 2, start: true, station: 1, img: "room_weapons_2", facing: "up" },
    { id: "drones", room: 2, power: 2, start: false, station: -1, img: "room_drones_11" },
    { id: "medbay", room: 10, power: 1, start: true, station: -2, img: "room_medbay_5" },
    { id: "clonebay", room: 10, power: 1, start: false, station: 0 },
    { id: "teleporter", room: 5, power: 1, start: false, station: -1 },
    { id: "artillery", room: 12, power: 2, start: true, station: -1, weapon: "ARTILLERY_FED" },
    { id: "cloaking", room: 11, power: 1, start: false, station: -1, img: "room_cloaking_9" },
    { id: "battery", room: 3, power: 1, start: false, station: -1, img: "room_battery_8" },
    { id: "mind", room: 6, power: 1, start: false, station: -1, img: "room_mind_7" },
    { id: "hacking", room: 13, power: 1, start: false, station: -1, img: "room_hacking_2", facing: "down" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "energy", "slug"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["LASER_BURST_2", "MISSILES_1"],
    drones: [],
    augments: [],
    missiles: 9,
    droneParts: 0,
  };
  readonly layout = L_fed_cruiser_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "fed_cruiser_2", shield: "fed_cruiser", cloak: "fed_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
