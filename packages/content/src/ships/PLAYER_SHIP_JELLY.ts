/** Man of War (Slug Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_jelly_cruiser from "../layouts/jelly_cruiser.ts";

export default class PLAYER_SHIP_JELLY implements ShipConfig {
  readonly id = "PLAYER_SHIP_JELLY";
  readonly title = "Man of War";
  readonly className = "Slug Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 1, power: 2, start: true, station: 1, img: "room_doors_6", facing: "right" },
    { id: "oxygen", room: 4, power: 1, start: true, station: -1, img: "room_oxygen_6" },
    { id: "engines", room: 6, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 13, power: 2, start: true, station: 0, img: "room_shields_6", facing: "left" },
    { id: "weapons", room: 5, power: 3, start: true, station: 1, img: "room_weapons_6", facing: "up" },
    { id: "medbay", room: 3, power: 1, start: true, station: 1 },
    { id: "clonebay", room: 3, power: 1, start: false, station: 1 },
    { id: "sensors", room: 11, power: 1, start: false, station: 1, img: "room_sensors_6", facing: "right" },
    { id: "drones", room: 14, power: 2, start: false, station: -1, img: "room_drones_5" },
    { id: "teleporter", room: 10, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 2, power: 1, start: false, station: -1, img: "room_cloaking_6" },
    { id: "battery", room: 9, power: 1, start: false, station: -1, img: "room_battery_10" },
    { id: "mind", room: 0, power: 1, start: false, station: -1, img: "room_mind_6" },
    { id: "hacking", room: 12, power: 1, start: false, station: -1, img: "room_hacking_5", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["slug", "slug"],
    crewCount: 2,
    crewRace: "slug",
    weapons: ["BEAM_BIO", "BOMB_BREACH_1", "LASER_BURST_2"],
    drones: [],
    augments: ["SLUG_GEL"],
    missiles: 15,
    droneParts: 0,
  };
  readonly layout = L_jelly_cruiser;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "jelly_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
