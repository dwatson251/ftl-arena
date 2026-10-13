/** Crystal Scout (Crystal Scout). */
import type { ShipConfig } from "../types.ts";
import L_crystal_scout from "../layouts/crystal_scout.ts";

export default class CRYSTAL_SCOUT implements ShipConfig {
  readonly id = "CRYSTAL_SCOUT";
  readonly title = "Crystal Scout";
  readonly className = "Crystal Scout";
  readonly health = 7;
  readonly reactor = 9;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 3, power: 1, start: true, station: 0, max: 3 },
    { id: "medbay", room: 5, power: 1, start: false, station: 1, max: 3 },
    { id: "oxygen", room: 0, power: 1, start: true, station: -1, max: 3 },
    { id: "shields", room: 1, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 4, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 2, power: 4, start: true, station: 0, max: 8 },
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
  readonly layout = L_crystal_scout;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "crystal_scout", cloak: "crystal_scout" };
  readonly enemy: ShipConfig["enemy"] = {
    scale: 1,
    single: true,
    weaponPool: ["BOMB_LOCK", "CRYSTAL_BURST_1", "CRYSTAL_BURST_2", "CRYSTAL_HEAVY_1", "CRYSTAL_HEAVY_2"],
    crewMax: 3,
  };
}
