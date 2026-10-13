/** Ariolimax (Slug Cruiser · Type C). */
import type { ShipConfig } from "../types.ts";
import L_jelly_cruiser_3 from "../layouts/jelly_cruiser_3.ts";

export default class PLAYER_SHIP_JELLY_3 implements ShipConfig {
  readonly id = "PLAYER_SHIP_JELLY_3";
  readonly title = "Ariolimax";
  readonly className = "Slug Cruiser · Type C";
  readonly health = 30;
  readonly reactor = 9;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 10, power: 2, start: true, station: 1, img: "room_doors_9", facing: "right" },
    { id: "oxygen", room: 3, power: 1, start: true, station: -1, img: "room_oxygen_2" },
    { id: "engines", room: 6, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 7, power: 2, start: true, station: 1, img: "room_shields_7", facing: "up" },
    { id: "weapons", room: 9, power: 2, start: true, station: 1, img: "room_weapons_5", facing: "right" },
    { id: "medbay", room: 15, power: 1, start: false, station: -2, img: "room_medbay_9" },
    { id: "clonebay", room: 15, power: 1, start: true, station: 1 },
    { id: "sensors", room: 5, power: 1, start: false, station: 1, img: "room_sensors_3", facing: "right" },
    { id: "drones", room: 13, power: 2, start: false, station: -1, img: "room_drones_15" },
    { id: "teleporter", room: 11, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 1, power: 1, start: false, station: -1, img: "room_cloaking_3" },
    { id: "battery", room: 4, power: 1, start: false, station: -1, img: "room_battery_10" },
    { id: "mind", room: 0, power: 1, start: true, station: -1, img: "room_mind_5" },
    { id: "hacking", room: 12, power: 1, start: true, station: -1, img: "room_hacking_8", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["slug", "slug", "slug"],
    crewCount: 3,
    crewRace: "slug",
    weapons: ["LASER_CHAINGUN"],
    drones: [],
    augments: ["SLUG_GEL"],
    missiles: 1,
    droneParts: 15,
  };
  readonly layout = L_jelly_cruiser_3;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "jelly_cruiser_3", floor: "jelly_cruiser", shield: "jelly_cruiser", cloak: "jelly_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
