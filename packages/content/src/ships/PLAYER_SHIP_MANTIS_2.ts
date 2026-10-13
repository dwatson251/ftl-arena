/** The Basilisk (Mantis Cruiser · Type B). */
import type { ShipConfig } from "../types.ts";
import L_mantis_cruiser_2 from "../layouts/mantis_cruiser_2.ts";

export default class PLAYER_SHIP_MANTIS_2 implements ShipConfig {
  readonly id = "PLAYER_SHIP_MANTIS_2";
  readonly title = "The Basilisk";
  readonly className = "Mantis Cruiser · Type B";
  readonly health = 30;
  readonly reactor = 11;
  readonly weaponSlots = 3;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 8, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 15, power: 1, start: true, station: 1, facing: "up" },
    { id: "sensors", room: 1, power: 1, start: true, station: 1, facing: "down" },
    { id: "oxygen", room: 16, power: 1, start: true, station: -1, img: "room_oxygen_5" },
    { id: "shields", room: 7, power: 4, start: true, station: 0, img: "room_shields_5", facing: "up" },
    { id: "engines", room: 10, power: 1, start: true, station: 2, img: "room_engines_4", facing: "down" },
    { id: "weapons", room: 6, power: 1, start: true, station: 1, img: "room_weapons_3", facing: "up" },
    { id: "drones", room: 11, power: 3, start: true, station: -1, img: "room_drones_6" },
    { id: "medbay", room: 3, power: 1, start: true, station: 3, img: "room_medbay_3" },
    { id: "clonebay", room: 3, power: 1, start: false, station: 0 },
    { id: "teleporter", room: 9, power: 1, start: true, station: -1 },
    { id: "cloaking", room: 0, power: 1, start: false, station: -1, img: "room_cloaking_6" },
    { id: "battery", room: 2, power: 1, start: false, station: -1, img: "room_battery_5" },
    { id: "mind", room: 5, power: 1, start: false, station: -1, img: "room_mind_5" },
    { id: "hacking", room: 13, power: 1, start: false, station: -1, img: "room_hacking_2", facing: "down" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["mantis", "mantis"],
    crewCount: 2,
    crewRace: "mantis",
    weapons: [],
    drones: ["BOARDER", "DEFENSE_1"],
    augments: ["CREW_STIMS"],
    missiles: 0,
    droneParts: 15,
  };
  readonly layout = L_mantis_cruiser_2;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "mantis_cruiser_2", shield: "mantis_cruiser", cloak: "mantis_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
