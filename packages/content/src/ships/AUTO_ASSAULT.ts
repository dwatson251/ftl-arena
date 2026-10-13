/** Auto-Assault (Auto-Assault). */
import type { ShipConfig } from "../types.ts";
import L_auto_assault from "../layouts/auto_assault.ts";

export default class AUTO_ASSAULT implements ShipConfig {
  readonly id = "AUTO_ASSAULT";
  readonly title = "Auto-Assault";
  readonly className = "Auto-Assault";
  readonly health = 8;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 2, power: 1, start: true, station: 0, max: 3 },
    { id: "shields", room: 3, power: 2, start: true, station: 0, max: 9 },
    { id: "engines", room: 4, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 1, power: 1, start: true, station: 0, max: 6 },
    { id: "drones", room: 0, power: 2, start: true, station: -1, max: 6 },
  ];
  readonly loadout: ShipConfig["loadout"] = { crew: [], crewCount: 0, crewRace: "human", weapons: [], drones: [], augments: [], missiles: 10, droneParts: 5 };
  readonly layout = L_auto_assault;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "auto_assault", cloak: "auto_assault" };
  readonly enemy: ShipConfig["enemy"] = {
    scale: 1,
    single: true,
    auto: true,
    weaponPool: [
      "LASER_BURST_1",
      "LASER_BURST_2_A",
      "LASER_BURST_3",
      "LASER_BURST_5",
      "LASER_HEAVY_1",
      "LASER_HEAVY_2",
      "MISSILES_1",
      "MISSILES_2",
      "MISSILES_3",
      "BEAM_1",
      "BEAM_2",
      "BOMB_1",
      "BOMB_FIRE",
      "BOMB_ION",
      "ION_1",
      "ION_2",
      "ION_4",
    ],
    crewMax: 0,
  };
}
