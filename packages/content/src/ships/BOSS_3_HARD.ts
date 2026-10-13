/** Rebel Flagship (stage 3) (hard) (Rebel Flagship). */
import type { ShipConfig } from "../types.ts";
import L_boss_3 from "../layouts/boss_3.ts";

export default class BOSS_3_HARD implements ShipConfig {
  readonly id = "BOSS_3_HARD";
  readonly title = "Rebel Flagship (stage 3) (hard)";
  readonly className = "Rebel Flagship";
  readonly health = 20;
  readonly reactor = 31;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 3, start: true, station: 0 },
    { id: "shields", room: 1, power: 8, start: true, station: 0 },
    { id: "teleporter", room: 3, power: 2, start: true, station: -1 },
    { id: "medbay", room: 5, power: 3, start: true, station: 1 },
    { id: "engines", room: 8, power: 6, start: true, station: 0 },
    { id: "oxygen", room: 7, power: 2, start: true, station: -1 },
    { id: "artillery", room: 9, power: 4, start: true, station: -1, weapon: "ARTILLERY_BOSS_1" },
    { id: "artillery2", room: 10, power: 4, start: true, station: -1, weapon: "ARTILLERY_BOSS_2" },
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
  readonly layout = L_boss_3;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "boss_3" };
  readonly enemy: ShipConfig["enemy"] = { scale: 1, single: true, weaponPool: [], crewMax: 8 };
}
