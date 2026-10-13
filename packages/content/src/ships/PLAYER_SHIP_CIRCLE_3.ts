/** Tetragon (Engi Cruiser · Type C). */
import type { ShipConfig } from "../types.ts";
import L_circle_cruiser_3 from "../layouts/circle_cruiser_3.ts";

export default class PLAYER_SHIP_CIRCLE_3 implements ShipConfig {
  readonly id = "PLAYER_SHIP_CIRCLE_3";
  readonly title = "Tetragon";
  readonly className = "Engi Cruiser · Type C";
  readonly health = 30;
  readonly reactor = 9;
  readonly weaponSlots = 3;
  readonly droneSlots = 3;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 14, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 16, power: 1, start: true, station: 0, img: "room_doors_2", facing: "down" },
    { id: "sensors", room: 13, power: 1, start: true, station: 0, img: "room_sensors_2", facing: "up" },
    { id: "oxygen", room: 0, power: 1, start: true, station: -1, img: "room_oxygen_13" },
    { id: "engines", room: 10, power: 2, start: true, station: 1, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 8, power: 2, start: true, station: 0, img: "room_shields_4", facing: "left" },
    { id: "weapons", room: 6, power: 1, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 7, power: 2, start: true, station: -1, img: "room_drones_9" },
    { id: "medbay", room: 11, power: 1, start: false, station: -2, img: "room_medbay_9" },
    { id: "clonebay", room: 11, power: 1, start: true, station: 1 },
    { id: "teleporter", room: 4, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 1, power: 1, start: false, station: -1, img: "room_cloaking_4" },
    { id: "battery", room: 2, power: 1, start: false, station: -1, img: "room_battery_17" },
    { id: "mind", room: 3, power: 1, start: false, station: -1, img: "room_mind_12" },
    { id: "hacking", room: 5, power: 1, start: true, station: -1, img: "room_hacking_5", facing: "down" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["anaerobic", "engi", "engi"],
    crewCount: 3,
    crewRace: "anaerobic",
    weapons: ["LASER_BURST_2"],
    drones: ["COMBAT_BEAM"],
    augments: ["DEFENSE_SCRAMBLER"],
    missiles: 0,
    droneParts: 25,
  };
  readonly layout = L_circle_cruiser_3;
  readonly sprites: ShipConfig["sprites"] = {
    dir: "ship",
    img: "circle_cruiser_3",
    floor: "circle_cruiser",
    shield: "circle_cruiser",
    cloak: "circle_cruiser",
  };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
