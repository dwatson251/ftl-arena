/** Cerenkov (Zoltan Cruiser · Type C). */
import type { ShipConfig } from "../types.ts";
import L_energy_cruiser_3 from "../layouts/energy_cruiser_3.ts";

export default class PLAYER_SHIP_ENERGY_3 implements ShipConfig {
  readonly id = "PLAYER_SHIP_ENERGY_3";
  readonly title = "Cerenkov";
  readonly className = "Zoltan Cruiser · Type C";
  readonly health = 30;
  readonly reactor = 2;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 17, power: 1, start: true, station: 0, img: "room_doors_2", facing: "down" },
    { id: "sensors", room: 16, power: 1, start: true, station: 1, facing: "down" },
    { id: "oxygen", room: 3, power: 1, start: true, station: -1, img: "room_oxygen_2" },
    { id: "engines", room: 0, power: 2, start: true, station: 0, img: "room_engines_5", facing: "up" },
    { id: "shields", room: 1, power: 2, start: true, station: 2, img: "room_shields_3", facing: "left" },
    { id: "weapons", room: 2, power: 2, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 14, power: 3, start: true, station: -1, img: "room_drones_5" },
    { id: "medbay", room: 11, power: 1, start: false, station: 0, img: "room_medbay_4" },
    { id: "clonebay", room: 11, power: 1, start: true, station: 0 },
    { id: "teleporter", room: 13, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 9, power: 1, start: false, station: -1, img: "room_cloaking_3" },
    { id: "battery", room: 4, power: 2, start: true, station: -1, img: "room_battery_9" },
    { id: "mind", room: 12, power: 1, start: false, station: -1, img: "room_mind_5" },
    { id: "hacking", room: 6, power: 1, start: false, station: -1, img: "room_hacking_7", facing: "left" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["energy", "energy", "energy", "energy"],
    crewCount: 4,
    crewRace: "energy",
    weapons: ["ION_CHARGEGUN"],
    drones: ["COMBAT_BEAM"],
    augments: ["ENERGY_SHIELD"],
    missiles: 2,
    droneParts: 15,
  };
  readonly layout = L_energy_cruiser_3;
  readonly sprites: ShipConfig["sprites"] = {
    dir: "ship",
    img: "energy_cruiser_3",
    floor: "energy_cruiser",
    shield: "energy_cruiser",
    cloak: "energy_cruiser",
  };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
