/** Simo-H (Stealth Cruiser · Type C). */
import type { ShipConfig } from "../types.ts";
import L_stealth_3 from "../layouts/stealth_3.ts";

export default class PLAYER_SHIP_STEALTH_3 implements ShipConfig {
  readonly id = "PLAYER_SHIP_STEALTH_3";
  readonly title = "Simo-H";
  readonly className = "Stealth Cruiser · Type C";
  readonly health = 30;
  readonly reactor = 7;
  readonly weaponSlots = 3;
  readonly droneSlots = 3;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 9, power: 1, start: true, station: 0, img: "room_doors_2", facing: "down" },
    { id: "sensors", room: 4, power: 1, start: false, station: 0, img: "room_sensors_2", facing: "up" },
    { id: "oxygen", room: 1, power: 1, start: true, station: -1, img: "room_oxygen_2" },
    { id: "engines", room: 5, power: 3, start: true, station: 2, img: "room_engines", facing: "down" },
    { id: "shields", room: 6, power: 2, start: false, station: 1, img: "room_shields_7", facing: "up" },
    { id: "weapons", room: 3, power: 2, start: true, station: 1, img: "room_weapons_5", facing: "right" },
    { id: "drones", room: 11, power: 2, start: true, station: -1, img: "room_drones_4" },
    { id: "medbay", room: 0, power: 1, start: false, station: 0, img: "room_medbay_4" },
    { id: "clonebay", room: 0, power: 1, start: true, station: 0 },
    { id: "teleporter", room: 10, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 12, power: 1, start: false, station: -1, img: "room_cloaking_11" },
    { id: "hacking", room: 13, power: 1, start: false, station: -1, img: "room_hacking", facing: "down" },
    { id: "battery", room: 2, power: 1, start: false, station: -1, img: "room_battery_15" },
    { id: "mind", room: 7, power: 1, start: false, station: -1, img: "room_mind_5" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "rock", "slug"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["LASER_CHARGEGUN_PLAYER", "BEAM_1"],
    drones: ["DRONE_SHIELD_PLAYER", "ANTI_DRONE"],
    augments: ["ADV_SCANNERS"],
    missiles: 0,
    droneParts: 16,
  };
  readonly layout = L_stealth_3;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "stealth_3", floor: "stealth", shield: "stealth", cloak: "stealth" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
