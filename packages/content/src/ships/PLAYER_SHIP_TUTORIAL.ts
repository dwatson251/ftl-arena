/** The Kestrel (Kestrel · Type A). */
import type { ShipConfig } from "../types.ts";
import L_kestral from "../layouts/kestral.ts";

export default class PLAYER_SHIP_TUTORIAL implements ShipConfig {
  readonly id = "PLAYER_SHIP_TUTORIAL";
  readonly title = "The Kestrel";
  readonly className = "Kestrel · Type A";
  readonly health = 30;
  readonly reactor = 9;
  readonly weaponSlots = 2;
  readonly droneSlots = 2;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 1, start: true, station: 0, img: "room_pilot", facing: "right" },
    { id: "doors", room: 2, power: 2, start: true, station: 1, facing: "up" },
    { id: "sensors", room: 3, power: 2, start: true, station: 1, facing: "down" },
    { id: "medbay", room: 4, power: 1, start: true, station: 1 },
    { id: "oxygen", room: 13, power: 1, start: true, station: -1 },
    { id: "shields", room: 5, power: 2, start: true, station: 0, img: "room_shields", facing: "left" },
    { id: "engines", room: 14, power: 2, start: true, station: 2, img: "room_engines", facing: "down" },
    { id: "weapons", room: 10, power: 2, start: true, station: 1, img: "room_weapons", facing: "up" },
    { id: "drones", room: 1, power: 2, start: false, station: -1 },
    { id: "teleporter", room: 15, power: 1, start: false, station: -1 },
    { id: "cloaking", room: 8, power: 1, start: false, station: -1 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human"],
    crewCount: 1,
    crewRace: "human",
    weapons: ["LASER_BURST_2"],
    drones: [],
    augments: [],
    missiles: 20,
    droneParts: 0,
  };
  readonly layout = L_kestral;
  readonly sprites: ShipConfig["sprites"] = { dir: "ship", img: "kestral" };
  readonly enemy: ShipConfig["enemy"] = { scale: 1 };
}
