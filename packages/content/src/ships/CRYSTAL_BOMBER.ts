/** Crystal Bomber (Crystal Bomber). */
import type { ShipConfig } from "../types.ts";
import L_crystal_bomber from "../layouts/crystal_bomber.ts";

export default class CRYSTAL_BOMBER implements ShipConfig {
  readonly id = "CRYSTAL_BOMBER";
  readonly title = "Crystal Bomber";
  readonly className = "Crystal Bomber";
  readonly health = 9;
  readonly reactor = 9;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 2, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 8, power: 1, start: false, station: 0, max: 3 },
    { id: "medbay", room: 0, power: 1, start: false, station: 1, max: 3 },
    { id: "oxygen", room: 6, power: 1, start: true, station: -1, max: 3 },
    { id: "shields", room: 4, power: 2, start: true, station: 0, max: 10 },
    { id: "engines", room: 5, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 7, power: 2, start: true, station: 0, max: 10 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["crystal", "crystal"],
    crewCount: 2,
    crewRace: "crystal",
    weapons: [],
    drones: [],
    augments: [],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_crystal_bomber;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "crystal_bomber", cloak: "crystal_bomber" };
  readonly enemy: ShipConfig["enemy"] = {
    scale: 1,
    single: true,
    weaponPool: ["BOMB_LOCK", "CRYSTAL_BURST_1", "CRYSTAL_BURST_2", "CRYSTAL_HEAVY_1", "CRYSTAL_HEAVY_2"],
    crewMax: 5,
  };
}
