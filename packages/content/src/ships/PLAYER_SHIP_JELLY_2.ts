/** The Stormwalker (Slug Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_jelly_cruiser_2 from "../layouts/jelly_cruiser_2.ts";

export default class PLAYER_SHIP_JELLY_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_JELLY_2";
  readonly title = "The Stormwalker";
  readonly className = "Slug Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 11, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 19, power: 2, start: true, station: 0, img: "room_doors_2", facing: "down" },
    { id: "sensors", room: 0, power: 1, start: false, station: 0, img: "room_sensors_2", facing: "up" },
    { id: "oxygen", room: 15, power: 1, start: true, station: -1, img: "room_oxygen_8" },
    { id: "engines", room: 2, power: 2, start: true, station: 2, img: "room_engines", facing: "down" },
    { id: "shields", room: 12, power: 2, start: true, station: 1, img: "room_shields_7", facing: "up" },
    { id: "weapons", room: 13, power: 2, start: true, station: 0, img: "room_weapons_4", facing: "up" },
    { id: "medbay", room: 7, power: 1, start: false, station: 1 },
    { id: "clonebay", room: 7, power: 1, start: false, station: 1 },
    { id: "drones", room: 18, power: 2, start: false, station: -1, img: "room_drones_10" },
    { id: "teleporter", room: 3, power: 1, start: true, station: -1 },
    { id: "cloaking", room: 5, power: 1, start: false, station: -1 },
    { id: "battery", room: 14, power: 1, start: false, station: -1, img: "room_battery_9" },
    { id: "mind", room: 4, power: 1, start: false, station: -1, img: "room_mind_5" },
    { id: "hacking", room: 9, power: 1, start: false, station: -1, img: "room_hacking_6", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["slug", "slug", "slug"],
    crewCount: 3,
    crewRace: "slug",
    weapons: ["BOMB_HEAL", "MISSILES_2_PLAYER"],
    drones: [],
    augments: ["SLUG_GEL"],
    missiles: 25,
    droneParts: 0,
  };
  readonly layout = L_jelly_cruiser_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "jelly_cruiser_2", shield: "jelly_cruiser", cloak: "jelly_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
