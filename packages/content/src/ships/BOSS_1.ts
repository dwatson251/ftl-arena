/** Rebel Flagship (stage 1) (Rebel Flagship). */
import type { ShipConfig } from "../types.ts";
import L_boss_1_easy from "../layouts/boss_1_easy.ts";

export default class BOSS_1 implements ShipConfig {
  readonly id = "BOSS_1";
  readonly title = "Rebel Flagship (stage 1)";
  readonly className = "Rebel Flagship";
  readonly health = 20;
  readonly reactor = 42;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 3, start: true, station: 0 },
    { id: "shields", room: 1, power: 8, start: true, station: 0 },
    { id: "doors", room: 17, power: 3, start: true, station: 0 },
    { id: "teleporter", room: 3, power: 2, start: true, station: -1 },
    { id: "cloaking", room: 15, power: 2, start: true, station: -1 },
    { id: "sensors", room: 13, power: 2, start: true, station: 0 },
    { id: "medbay", room: 5, power: 3, start: true, station: 1 },
    { id: "engines", room: 8, power: 2, start: true, station: 0 },
    { id: "oxygen", room: 7, power: 2, start: true, station: -1 },
    { id: "drones", room: 12, power: 1, start: true, station: -1 },
    { id: "artillery", room: 9, power: 4, start: true, station: -1, weapon: "ARTILLERY_BOSS_1" },
    { id: "artillery2", room: 10, power: 4, start: true, station: -1, weapon: "ARTILLERY_BOSS_2" },
    { id: "artillery3", room: 14, power: 3, start: true, station: -1, weapon: "ARTILLERY_BOSS_3" },
    { id: "artillery4", room: 18, power: 3, start: true, station: -1, weapon: "ARTILLERY_BOSS_4" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "human", "human", "human", "human", "human", "human"],
    crewCount: 8,
    crewRace: "human",
    weapons: [],
    drones: [],
    augments: [],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_boss_1_easy;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "boss_1" };
  readonly enemy: ShipConfig["enemy"] = { scale: 1, single: true, weaponPool: [], crewMax: 8 };
}
