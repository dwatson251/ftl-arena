/** The Swallow (Kestrel Cruiser · Type C). */
import type { ShipConfig } from "../types.ts";
import L_kestral_3 from "../layouts/kestral_3.ts";

export default class PLAYER_SHIP_HARD_3 implements ShipConfig {
  readonly id = "PLAYER_SHIP_HARD_3";
  readonly title = "The Swallow";
  readonly className = "Kestrel Cruiser · Type C";
  readonly health = 30;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 11, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 10, power: 1, start: true, station: 1, img: "room_doors", facing: "up" },
    { id: "sensors", room: 13, power: 2, start: true, station: 1, img: "room_sensors", facing: "down" },
    { id: "medbay", room: 9, power: 1, start: false, station: 1, img: "room_medbay_8" },
    { id: "clonebay", room: 9, power: 1, start: true, station: 1 },
    { id: "oxygen", room: 7, power: 1, start: true, station: -1, img: "room_oxygen_10" },
    { id: "shields", room: 12, power: 2, start: true, station: 2, img: "room_shields_3", facing: "left" },
    { id: "engines", room: 5, power: 2, start: true, station: 2, img: "room_engines", facing: "down" },
    { id: "weapons", room: 2, power: 2, start: true, station: 1, img: "room_weapons_2", facing: "up" },
    { id: "drones", room: 6, power: 2, start: false, station: -1, img: "room_drones_13" },
    { id: "teleporter", room: 4, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 1, power: 1, start: false, station: -1, img: "room_cloaking_3" },
    { id: "battery", room: 8, power: 1, start: false, station: -1, img: "room_battery_6" },
    { id: "mind", room: 16, power: 1, start: false, station: -1, img: "room_mind_1" },
    { id: "hacking", room: 14, power: 1, start: false, station: -1, img: "room_hacking", facing: "down" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "anaerobic", "human"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["LASER_BURST_2", "ION_STUN"],
    drones: [],
    augments: [],
    missiles: 4,
    droneParts: 3,
  };
  readonly layout = L_kestral_3;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "kestral_3", floor: "kestral", shield: "kestral", cloak: "kestral" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
