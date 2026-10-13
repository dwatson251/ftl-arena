/** Rebel Flagship (stage 2) (Rebel Flagship). */
import type { ShipConfig } from "../types.ts";
import L_boss_2_easy from "../layouts/boss_2_easy.ts";

export default class BOSS_2 implements ShipConfig {
  readonly id = "BOSS_2";
  readonly title = "Rebel Flagship (stage 2)";
  readonly className = "Rebel Flagship";
  readonly health = 22;
  readonly reactor = 44;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 3, start: true, station: 0 },
    { id: "shields", room: 1, power: 8, start: true, station: 0 },
    { id: "teleporter", room: 3, power: 2, start: true, station: -1 },
    { id: "medbay", room: 5, power: 3, start: true, station: 1 },
    { id: "engines", room: 8, power: 3, start: true, station: 0 },
    { id: "oxygen", room: 7, power: 2, start: true, station: -1 },
    { id: "sensors", room: 13, power: 2, start: true, station: 0 },
    { id: "drones", room: 12, power: 8, start: true, station: -1 },
    { id: "artillery", room: 9, power: 4, start: true, station: -1, weapon: "ARTILLERY_BOSS_1" },
    { id: "artillery2", room: 10, power: 4, start: true, station: -1, weapon: "ARTILLERY_BOSS_2" },
    { id: "artillery3", room: 14, power: 3, start: true, station: -1, weapon: "ARTILLERY_BOSS_3" },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["human", "human", "human", "human", "human", "human", "human", "human"],
    crewCount: 8,
    crewRace: "human",
    weapons: [],
    drones: ["DEFENSE_1", "COMBAT_1", "COMBAT_BEAM", "BOARDER_BOSS"],
    augments: [],
    missiles: 10,
    droneParts: 10,
  };
  readonly layout = L_boss_2_easy;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "boss_2" };
  readonly enemy: ShipConfig["enemy"] = { scale: 1, single: true, weaponPool: [], crewMax: 8 };
}
