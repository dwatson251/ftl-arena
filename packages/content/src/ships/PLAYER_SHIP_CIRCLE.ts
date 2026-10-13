/** The Torus (Engi Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_circle_cruiser from "../layouts/circle_cruiser.ts";

export default class PLAYER_SHIP_CIRCLE implements ShipConfig {
  readonly id = "PLAYER_SHIP_CIRCLE";
  readonly title = "The Torus";
  readonly className = "Engi Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 10;
  readonly weaponSlots = 3;
  readonly droneSlots = 3;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 5, power: 1, start: true, station: 0, img: "room_doors_4", facing: "right" },
    { id: "sensors", room: 4, power: 1, start: true, station: 1, img: "room_sensors_4", facing: "left" },
    { id: "oxygen", room: 15, power: 1, start: true, station: -1, img: "room_oxygen_4" },
    { id: "engines", room: 2, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 3, power: 2, start: true, station: 0, img: "room_shields_4", facing: "left" },
    { id: "weapons", room: 11, power: 3, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 0, power: 3, start: true, station: -1 },
    { id: "medbay", room: 7, power: 1, start: true, station: 1 },
    { id: "clonebay", room: 7, power: 1, start: false, station: 1 },
    { id: "teleporter", room: 9, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 12, power: 1, start: false, station: -1, img: "room_cloaking_4" },
    { id: "battery", room: 1, power: 1, start: false, station: -1, img: "room_battery_6" },
    { id: "mind", room: 6, power: 1, start: false, station: -1, img: "room_mind_6" },
    { id: "hacking", room: 14, power: 1, start: false, station: -1, img: "room_hacking_2", facing: "down" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "engi", "engi"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["ION_4"],
    drones: ["COMBAT_1"],
    augments: ["NANO_MEDBAY"],
    missiles: 0,
    droneParts: 15,
  };
  readonly layout = L_circle_cruiser;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "circle_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
