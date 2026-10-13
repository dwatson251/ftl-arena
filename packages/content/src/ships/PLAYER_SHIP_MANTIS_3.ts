/** The Theseus (Mantis Cruiser · Type C). */
import type { ShipConfig } from "../types.ts";
import L_mantis_cruiser_3 from "../layouts/mantis_cruiser_3.ts";

export default class PLAYER_SHIP_MANTIS_3 implements ShipConfig {
  readonly id = "PLAYER_SHIP_MANTIS_3";
  readonly title = "The Theseus";
  readonly className = "Mantis Cruiser · Type C";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 3;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 7, power: 1, start: true, station: 0, img: "room_pilot_4", facing: "right" },
    { id: "doors", room: 9, power: 1, start: true, station: 1, facing: "up" },
    { id: "sensors", room: 10, power: 1, start: true, station: 1, facing: "down" },
    { id: "oxygen", room: 5, power: 1, start: true, station: -1, img: "room_oxygen_12" },
    { id: "shields", room: 6, power: 2, start: true, station: 2, img: "room_shields_3", facing: "left" },
    { id: "engines", room: 0, power: 2, start: true, station: 2, img: "room_engines_2", facing: "down" },
    { id: "weapons", room: 12, power: 2, start: true, station: 1, img: "room_weapons_9", facing: "up" },
    { id: "drones", room: 16, power: 2, start: false, station: -1, img: "room_drones_11" },
    { id: "medbay", room: 3, power: 1, start: false, station: 1 },
    { id: "clonebay", room: 3, power: 2, start: true, station: 1 },
    { id: "teleporter", room: 15, power: 1, start: true, station: -1 },
    { id: "cloaking", room: 13, power: 1, start: false, station: -1, img: "room_cloaking_10" },
    { id: "battery", room: 11, power: 1, start: false, station: -1, img: "room_battery_8" },
    { id: "mind", room: 8, power: 1, start: false, station: -1, img: "room_mind_4" },
    { id: "hacking", room: 2, power: 1, start: false, station: -1, img: "room_hacking_6", facing: "up" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["engi", "mantis", "anaerobic"],
    crewCount: 3,
    crewRace: "engi",
    weapons: ["BOMB_LOCK", "BOMB_STUN"],
    drones: [],
    augments: ["CREW_STIMS"],
    missiles: 20,
    droneParts: 0,
  };
  readonly layout = L_mantis_cruiser_3;
  readonly sprites: ShipConfig["sprites"] = {
    dir: "ship",
    img: "mantis_cruiser_3",
    floor: "mantis_cruiser",
    shield: "mantis_cruiser",
    cloak: "mantis_cruiser",
  };
  readonly player = { hangar: true };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
