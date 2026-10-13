/** The Kestrel (Kestrel · Type A). */
import type { ShipConfig } from "../types.ts";
import L_kestral from "../layouts/kestral.ts";

export default class PLAYER_SHIP_EASY implements ShipConfig {
  readonly id = "PLAYER_SHIP_EASY";
  readonly title = "The Kestrel";
  readonly className = "Kestrel · Type A";
  readonly health = 30;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 2, power: 1, start: true, station: 0 },
    { id: "sensors", room: 3, power: 1, start: true, station: 0 },
    { id: "medbay", room: 4, power: 1, start: true, station: 1 },
    { id: "oxygen", room: 13, power: 1, start: true, station: -1 },
    { id: "shields", room: 5, power: 2, start: true, station: 0, img: "room_shields", facing: "left" },
    { id: "engines", room: 14, power: 2, start: true, station: 2, img: "room_engines", facing: "down" },
    { id: "weapons", room: 10, power: 3, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 1, power: 2, start: false, station: -1 },
    { id: "teleporter", room: 15, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 8, power: 1, start: false, station: -1 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "human"],
    crewCount: 3,
    crewRace: "human",
    weapons: ["MISSILES_2_PLAYER", "LASER_BURST_3"],
    drones: [],
    augments: [],
    missiles: 8,
    droneParts: 0,
  };
  readonly layout = L_kestral;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "kestral" };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
