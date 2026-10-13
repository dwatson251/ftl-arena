/** Auto-Scout (Auto-Scout). */
import type { ShipConfig } from "../types.ts";
import L_auto_basic from "../layouts/auto_basic.ts";

export default class AUTO_BASIC implements ShipConfig {
  readonly id = "AUTO_BASIC";
  readonly title = "Auto-Scout";
  readonly className = "Auto-Scout";
  readonly health = 6;
  readonly reactor = 6;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 2, power: 1, start: true, station: 0, max: 2 },
    { id: "shields", room: 3, power: 2, start: false, station: 0, max: 8 },
    { id: "engines", room: 1, power: 2, start: true, station: 0, max: 8 },
    { id: "weapons", room: 4, power: 2, start: true, station: 0, max: 8 },
    { id: "cloaking", room: 0, power: 1, start: false, station: -1, max: 3 },
  ];
  readonly loadout: ShipConfig["loadout"] = { crew: [], crewCount: 0, crewRace: "human", weapons: [], drones: [], augments: [], missiles: 10, droneParts: 0 };
  readonly layout = L_auto_basic;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "auto_basic", cloak: "auto_basic" };
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
