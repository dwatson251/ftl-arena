/** DA-SR 12 (Stealth Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_stealth_2 from "../layouts/stealth_2.ts";

export default class PLAYER_SHIP_STEALTH_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_STEALTH_2";
  readonly title = "DA-SR 12";
  readonly className = "Stealth Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 7;
  readonly weaponSlots = 3;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 9, power: 1, start: true, station: 1, img: "room_pilot_2", facing: "right" },
    { id: "doors", room: 13, power: 1, start: true, station: 1, img: "room_doors_3", facing: "right" },
    { id: "sensors", room: 6, power: 2, start: true, station: 1, img: "room_sensors_3", facing: "right" },
    { id: "oxygen", room: 4, power: 1, start: true, station: -1, img: "room_oxygen_2" },
    { id: "engines", room: 5, power: 2, start: true, station: 1, img: "room_engines_3", facing: "right" },
    { id: "shields", room: 2, power: 2, start: false, station: 2, img: "room_shields_3", facing: "left" },
    { id: "weapons", room: 12, power: 4, start: true, station: 0, img: "room_weapons_4", facing: "up" },
    { id: "drones", room: 1, power: 2, start: false, station: -1, img: "room_drones_4" },
    { id: "medbay", room: 0, power: 1, start: true, station: -2, img: "room_medbay_2" },
    { id: "clonebay", room: 0, power: 1, start: false, station: 0 },
    { id: "teleporter", room: 14, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 11, power: 2, start: true, station: -1, img: "room_cloaking" },
    { id: "hacking", room: 8, power: 1, start: false, station: -1, img: "room_hacking_3", facing: "left" },
    { id: "battery", room: 3, power: 1, start: false, station: -1, img: "room_battery_3" },
    { id: "mind", room: 10, power: 1, start: false, station: -1, img: "room_mind_3" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "energy"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["BEAM_3"],
    drones: [],
    augments: ["ADV_SCANNERS"],
    missiles: 0,
    droneParts: 0,
  };
  readonly layout = L_stealth_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "stealth_2", shield: "stealth", cloak: "stealth" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
