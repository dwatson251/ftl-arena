/** The Fregatidae (Federation Cruiser · Type C). */
import type { ShipConfig } from "../types.ts";
import L_fed_cruiser_3 from "../layouts/fed_cruiser_3.ts";

export default class PLAYER_SHIP_FED_3 implements ShipConfig {
  readonly id = "PLAYER_SHIP_FED_3";
  readonly title = "The Fregatidae";
  readonly className = "Federation Cruiser · Type C";
  readonly health = 30;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 6, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 13, power: 1, start: true, station: 1, img: "room_doors", facing: "up" },
    { id: "sensors", room: 10, power: 1, start: true, station: 1, facing: "down" },
    { id: "oxygen", room: 12, power: 1, start: true, station: -1, img: "room_oxygen_2" },
    { id: "engines", room: 5, power: 2, start: true, station: 1, img: "room_engines_8", facing: "left" },
    { id: "shields", room: 15, power: 2, start: true, station: 0, img: "room_shields", facing: "left" },
    { id: "weapons", room: 11, power: 1, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 17, power: 2, start: false, station: -1, img: "room_drones_3" },
    { id: "medbay", room: 1, power: 1, start: false, station: 1 },
    { id: "clonebay", room: 1, power: 2, start: true, station: 1 },
    { id: "teleporter", room: 8, power: 1, start: true, station: -1 },
    { id: "artillery", room: 9, power: 1, start: true, station: -1, weapon: "ARTILLERY_FED_C" },
    { id: "cloaking", room: 4, power: 1, start: false, station: -1, img: "room_cloaking_3" },
    { id: "battery", room: 7, power: 1, start: false, station: -1, img: "room_battery_16" },
    { id: "mind", room: 16, power: 1, start: false, station: -1, img: "room_mind_3" },
    { id: "hacking", room: 2, power: 1, start: false, station: -1, img: "room_hacking_9", facing: "left" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "energy", "energy", "mantis"],
    crewCount: 4,
    crewRace: "human",
    weapons: [],
    drones: [],
    augments: ["O2_MASKS"],
    missiles: 5,
    droneParts: 0,
  };
  readonly layout = L_fed_cruiser_3;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "fed_cruiser_3", floor: "fed_cruiser", shield: "fed_cruiser", cloak: "fed_cruiser" };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
