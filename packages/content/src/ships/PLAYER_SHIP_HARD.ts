/** The Kestrel (Kestrel Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_kestral from "../layouts/kestral.ts";

export default class PLAYER_SHIP_HARD implements ShipConfig {
  readonly id = "PLAYER_SHIP_HARD";
  readonly title = "The Kestrel";
  readonly className = "Kestrel Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 2, power: 1, start: true, station: 1, img: "room_doors", facing: "up" },
    { id: "sensors", room: 3, power: 1, start: true, station: 1, img: "room_sensors", facing: "down" },
    { id: "medbay", room: 4, power: 1, start: true, station: 1, img: "room_medbay" },
    { id: "clonebay", room: 4, power: 1, start: false, station: 1 },
    { id: "oxygen", room: 13, power: 1, start: true, station: -1, img: "room_oxygen" },
    { id: "shields", room: 5, power: 2, start: true, station: 0, img: "room_shields", facing: "left" },
    { id: "engines", room: 14, power: 2, start: true, station: 2, img: "room_engines", facing: "down" },
    { id: "weapons", room: 10, power: 3, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 1, power: 2, start: false, station: -1 },
    { id: "teleporter", room: 15, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 8, power: 1, start: false, station: -1 },
    { id: "battery", room: 11, power: 1, start: false, station: -1, img: "room_battery" },
    { id: "mind", room: 7, power: 1, start: false, station: -1, img: "room_mind" },
    { id: "hacking", room: 12, power: 1, start: false, station: -1, img: "room_hacking", facing: "down" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "human"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["MISSILES_2_PLAYER", "LASER_BURST_3"],
    drones: [],
    augments: [],
    missiles: 8,
    droneParts: 2,
  };
  readonly layout = L_kestral;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "kestral" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
