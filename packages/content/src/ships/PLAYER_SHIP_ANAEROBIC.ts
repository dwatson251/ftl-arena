/** Kruos (Lanius Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_anaerobic_cruiser from "../layouts/anaerobic_cruiser.ts";

export default class PLAYER_SHIP_ANAEROBIC implements ShipConfig {
  readonly id = "PLAYER_SHIP_ANAEROBIC";
  readonly title = "Kruos";
  readonly className = "Lanius Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 0, img: "room_pilot_4", facing: "right" },
    { id: "doors", room: 15, power: 1, start: true, station: 0, img: "room_doors_2", facing: "down" },
    { id: "sensors", room: 14, power: 1, start: true, station: 1, img: "room_sensors", facing: "down" },
    { id: "oxygen", room: 2, power: 1, start: true, station: -1, img: "room_oxygen_2" },
    { id: "engines", room: 7, power: 1, start: true, station: 3, img: "room_engines_7", facing: "right" },
    { id: "shields", room: 5, power: 2, start: true, station: 3, img: "room_shields_10", facing: "down" },
    { id: "weapons", room: 9, power: 3, start: true, station: 1, img: "room_weapons_9", facing: "up" },
    { id: "drones", room: 11, power: 2, start: false, station: -1, img: "room_drones_9" },
    { id: "clonebay", room: 0, power: 1, start: true, station: 0 },
    { id: "medbay", room: 0, power: 1, start: false, station: 0, img: "room_medbay_4" },
    { id: "teleporter", room: 1, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 6, power: 1, start: false, station: -1, img: "room_cloaking_4" },
    { id: "battery", room: 10, power: 1, start: false, station: -1, img: "room_battery_10" },
    { id: "mind", room: 13, power: 1, start: false, station: -1, img: "room_mind_6" },
    { id: "hacking", room: 3, power: 1, start: true, station: -1, img: "room_hacking_5", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "anaerobic", "anaerobic"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["LASER_CHAINGUN", "ION_STUN"],
    drones: [],
    augments: ["O2_MASKS"],
    missiles: 3,
    droneParts: 9,
  };
  readonly layout = L_anaerobic_cruiser;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "anaerobic_cruiser", cloak: "anaerobic_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
