/** The Shrike (Lanius Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_anaerobic_cruiser_2 from "../layouts/anaerobic_cruiser_2.ts";

export default class PLAYER_SHIP_ANAEROBIC_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_ANAEROBIC_2";
  readonly title = "The Shrike";
  readonly className = "Lanius Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 9, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 16, power: 1, start: true, station: 0, img: "room_doors_2", facing: "down" },
    { id: "sensors", room: 0, power: 1, start: false, station: 0, img: "room_sensors_2", facing: "up" },
    { id: "oxygen", room: 5, power: 1, start: true, station: -1 },
    { id: "engines", room: 8, power: 1, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 4, power: 2, start: true, station: 2, img: "room_shields_3", facing: "left" },
    { id: "weapons", room: 13, power: 1, start: true, station: 0, img: "room_weapons_10", facing: "up" },
    { id: "drones", room: 2, power: 2, start: false, station: -1, img: "room_drones_7" },
    { id: "clonebay", room: 11, power: 1, start: true, station: 2 },
    { id: "medbay", room: 11, power: 1, start: false, station: 2, img: "room_medbay_7" },
    { id: "teleporter", room: 12, power: 1, start: true, station: -1 },
    { id: "cloaking", room: 1, power: 1, start: false, station: -1, img: "room_cloaking_3" },
    { id: "mind", room: 17, power: 1, start: true, station: -1, img: "room_mind_3" },
    { id: "battery", room: 15, power: 1, start: false, station: -1, img: "room_battery_12" },
    { id: "hacking", room: 3, power: 1, start: false, station: -1, img: "room_hacking_4", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["engi", "anaerobic", "anaerobic"],
    crewCount: 3,
    crewRace: "engi",
    weapons: ["SHOTGUN_PLAYER"],
    drones: [],
    augments: ["O2_MASKS"],
    missiles: 0,
    droneParts: 0,
  };
  readonly layout = L_anaerobic_cruiser_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "anaerobic_cruiser_2", shield: "anaerobic_cruiser", cloak: "anaerobic_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
