/** The Gila Monster (Mantis Cruiser · Type A). */
import type { ShipConfig } from "../types.ts";
import L_mantis_cruiser from "../layouts/mantis_cruiser.ts";

export default class PLAYER_SHIP_MANTIS implements ShipConfig {
  readonly id = "PLAYER_SHIP_MANTIS";
  readonly title = "The Gila Monster";
  readonly className = "Mantis Cruiser · Type A";
  readonly health = 30;
  readonly reactor = 7;
  readonly weaponSlots = 3;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 7, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 14, power: 1, start: true, station: 1, facing: "up" },
    { id: "sensors", room: 17, power: 1, start: false, station: 1, facing: "down" },
    { id: "oxygen", room: 4, power: 1, start: true, station: -1, img: "room_oxygen_3" },
    { id: "shields", room: 16, power: 2, start: true, station: 0, img: "room_shields", facing: "left" },
    { id: "engines", room: 10, power: 2, start: true, station: 1, img: "room_engines_9", facing: "up" },
    { id: "weapons", room: 13, power: 1, start: true, station: 1, img: "room_weapons_3", facing: "up" },
    { id: "drones", room: 0, power: 2, start: false, station: -1, img: "room_drones_3" },
    { id: "medbay", room: 2, power: 1, start: true, station: 1 },
    { id: "clonebay", room: 2, power: 1, start: false, station: 1 },
    { id: "teleporter", room: 1, power: 1, start: true, station: -1 },
    { id: "cloaking", room: 5, power: 1, start: false, station: -1, img: "room_cloaking_2" },
    { id: "battery", room: 3, power: 1, start: false, station: -1, img: "room_battery_4" },
    { id: "mind", room: 12, power: 1, start: false, station: -1, img: "room_mind_4" },
    { id: "hacking", room: 15, power: 1, start: false, station: -1, img: "room_hacking_6", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["mantis", "mantis", "mantis", "engi"],
    crewCount: 4,
    crewRace: "mantis",
    weapons: ["BOMB_1", "LASER_BURST_1"],
    drones: [],
    augments: ["CREW_STIMS"],
    missiles: 16,
    droneParts: 0,
  };
  readonly layout = L_mantis_cruiser;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "mantis_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
