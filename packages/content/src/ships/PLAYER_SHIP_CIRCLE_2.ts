/** The Vortex (Engi Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_circle_cruiser_2 from "../layouts/circle_cruiser_2.ts";

export default class PLAYER_SHIP_CIRCLE_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_CIRCLE_2";
  readonly title = "The Vortex";
  readonly className = "Engi Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 9;
  readonly weaponSlots = 3;
  readonly droneSlots = 3;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 13, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 8, power: 1, start: true, station: 1, facing: "up" },
    { id: "sensors", room: 2, power: 1, start: false, station: 1, facing: "down" },
    { id: "oxygen", room: 5, power: 1, start: true, station: -1, img: "room_oxygen_6" },
    { id: "engines", room: 0, power: 1, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 11, power: 2, start: true, station: 1, img: "room_shields_11", facing: "down" },
    { id: "weapons", room: 1, power: 3, start: true, station: 1, img: "room_weapons_8", facing: "up" },
    { id: "drones", room: 7, power: 3, start: true, station: -1, img: "room_drones_6" },
    { id: "medbay", room: 6, power: 1, start: true, station: -2, img: "room_medbay_6" },
    { id: "clonebay", room: 6, power: 1, start: false, station: 0 },
    { id: "teleporter", room: 3, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 12, power: 1, start: false, station: -1, img: "room_cloaking_7" },
    { id: "mind", room: 4, power: 1, start: false, station: -1, img: "room_mind_6" },
    { id: "battery", room: 10, power: 1, start: false, station: -1, img: "room_battery_7" },
    { id: "hacking", room: 9, power: 1, start: false, station: -1, img: "room_hacking_4" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["engi"],
    crewCount: 1,
    crewRace: "engi",
    weapons: ["ION_2", "LASER_HEAVY_1"],
    drones: ["BATTLE", "REPAIR", "REPAIR"],
    augments: ["DRONE_SPEED"],
    missiles: 0,
    droneParts: 6,
  };
  readonly layout = L_circle_cruiser_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "circle_cruiser_2", shield: "circle_cruiser", cloak: "circle_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
