/** Red-Tail (Kestrel Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_kestral_2 from "../layouts/kestral_2.ts";

export default class PLAYER_SHIP_HARD_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_HARD_2";
  readonly title = "Red-Tail";
  readonly className = "Kestrel Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 9, power: 1, start: true, station: 1, img: "room_pilot_3", facing: "right" },
    { id: "doors", room: 7, power: 1, start: true, station: 1, img: "room_doors", facing: "up" },
    { id: "sensors", room: 11, power: 1, start: true, station: 0, img: "room_sensors_2", facing: "up" },
    { id: "medbay", room: 0, power: 1, start: true, station: 0, img: "room_medbay_4" },
    { id: "clonebay", room: 0, power: 1, start: false, station: 0 },
    { id: "oxygen", room: 3, power: 1, start: true, station: -1, img: "room_oxygen_11" },
    { id: "shields", room: 2, power: 2, start: true, station: 1, img: "room_shields_9", facing: "up" },
    { id: "engines", room: 5, power: 2, start: true, station: 1, img: "room_engines_3", facing: "right" },
    { id: "weapons", room: 10, power: 4, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 13, power: 2, start: false, station: -1, img: "room_drones_12" },
    { id: "teleporter", room: 4, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 12, power: 1, start: false, station: -1, img: "room_cloaking_2" },
    { id: "battery", room: 6, power: 1, start: false, station: -1, img: "room_battery_2" },
    { id: "mind", room: 1, power: 1, start: false, station: -1, img: "room_mind_1" },
    { id: "hacking", room: 14, power: 1, start: false, station: -1, img: "room_hacking_4", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "energy", "mantis"],
    crewCount: 4,
    crewRace: "human",
    weapons: ["LASER_BURST_1", "LASER_BURST_1", "LASER_BURST_1", "LASER_BURST_1"],
    drones: [],
    augments: [],
    missiles: 5,
    droneParts: 0,
  };
  readonly layout = L_kestral_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "kestral_2", shield: "kestral", cloak: "kestral" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
