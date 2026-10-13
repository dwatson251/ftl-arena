/** The Adjudicator (Zoltan Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_energy_cruiser from "../layouts/energy_cruiser.ts";

export default class PLAYER_SHIP_ENERGY implements ShipConfig {
  readonly id = "PLAYER_SHIP_ENERGY";
  readonly title = "The Adjudicator";
  readonly className = "Zoltan Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 5;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 11, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 10, power: 2, start: true, station: 1, img: "room_doors_6", facing: "right" },
    { id: "sensors", room: 0, power: 1, start: true, station: 1, facing: "down" },
    { id: "oxygen", room: 4, power: 1, start: true, station: -1, img: "room_oxygen_2" },
    { id: "engines", room: 13, power: 1, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "shields", room: 15, power: 2, start: true, station: 1, img: "room_shields_7", facing: "up" },
    { id: "weapons", room: 14, power: 3, start: true, station: 1, img: "room_weapons_7", facing: "up" },
    { id: "drones", room: 16, power: 2, start: false, station: -1, img: "room_drones_8" },
    { id: "medbay", room: 8, power: 1, start: true, station: 0, img: "room_medbay_4" },
    { id: "clonebay", room: 8, power: 1, start: false, station: 0 },
    { id: "teleporter", room: 2, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 6, power: 1, start: false, station: -1, img: "room_cloaking_3" },
    { id: "battery", room: 7, power: 1, start: false, station: -1, img: "room_battery_11" },
    { id: "mind", room: 3, power: 1, start: false, station: -1, img: "room_mind_6" },
    { id: "hacking", room: 5, power: 1, start: false, station: -1, img: "room_hacking_3", facing: "left" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["energy", "energy", "energy"],
    crewCount: 3,
    crewRace: "energy",
    weapons: ["BEAM_2", "MISSILES_1"],
    drones: [],
    augments: ["ENERGY_SHIELD"],
    missiles: 12,
    droneParts: 2,
  };
  readonly layout = L_energy_cruiser;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "energy_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
