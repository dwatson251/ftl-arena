/** Noether (Zoltan Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_energy_cruiser_2 from "../layouts/energy_cruiser_2.ts";

export default class PLAYER_SHIP_ENERGY_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_ENERGY_2";
  readonly title = "Noether";
  readonly className = "Zoltan Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 5;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 14, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 8, power: 1, start: true, station: 1, img: "room_doors_7", facing: "up" },
    { id: "sensors", room: 13, power: 1, start: true, station: 1, img: "room_sensors_4", facing: "left" },
    { id: "oxygen", room: 12, power: 1, start: true, station: -1, img: "room_oxygen_7" },
    { id: "engines", room: 3, power: 2, start: true, station: 0, img: "room_engines_5", facing: "up" },
    { id: "shields", room: 5, power: 1, start: true, station: 0, img: "room_shields_8", facing: "left" },
    { id: "weapons", room: 7, power: 4, start: true, station: 0, img: "room_weapons_4", facing: "up" },
    { id: "drones", room: 2, power: 2, start: false, station: -1 },
    { id: "medbay", room: 0, power: 1, start: true, station: 0, img: "room_medbay_4" },
    { id: "clonebay", room: 0, power: 1, start: false, station: 0 },
    { id: "teleporter", room: 11, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 6, power: 1, start: false, station: -1 },
    { id: "battery", room: 9, power: 1, start: false, station: -1, img: "room_battery_13" },
    { id: "mind", room: 1, power: 1, start: false, station: -1, img: "room_mind_9" },
    { id: "hacking", room: 4, power: 1, start: false, station: -1, img: "room_hacking_5", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["energy", "energy", "energy"],
    crewCount: 3,
    crewRace: "energy",
    weapons: ["ION_1", "ION_1", "BEAM_LONG"],
    drones: [],
    augments: ["ENERGY_SHIELD"],
    missiles: 0,
    droneParts: 2,
  };
  readonly layout = L_energy_cruiser_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "energy_cruiser_2", shield: "energy_cruiser", cloak: "energy_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
