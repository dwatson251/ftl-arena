/** Slug Assault (Slug Assault). */
import type { ShipConfig } from "../types.ts";
import L_jelly_truffle from "../layouts/jelly_truffle.ts";

export default class JELLY_TRUFFLE implements ShipConfig {
  readonly id = "JELLY_TRUFFLE";
  readonly title = "Slug Assault";
  readonly className = "Slug Assault";
  readonly health = 11;
  readonly reactor = 10;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 1, power: 1, start: false, station: 0, max: 3 },
    { id: "oxygen", room: 4, power: 1, start: true, station: -1, max: 3 },
    { id: "medbay", room: 3, power: 1, start: false, station: 1, max: 3 },
    { id: "shields", room: 6, power: 2, start: true, station: 0, max: 10 },
    { id: "engines", room: 2, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 5, power: 2, start: true, station: 0, max: 10 },
    { id: "cloaking", room: 7, power: 1, start: false, station: -1, max: 1 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["slug", "slug", "slug", "slug"],
    crewCount: 4,
    crewRace: "slug",
    weapons: [],
    drones: [],
    augments: ["SLUG_GEL"],
    missiles: 14,
    droneParts: 0,
  };
  readonly layout = L_jelly_truffle;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "jelly_truffle", cloak: "jelly_truffle" };
  readonly enemy: ShipConfig["enemy"] = {
    scale: 1,
    single: true,
    weaponPool: [
      "LASER_BURST_1",
      "LASER_BURST_2_A",
      "LASER_BURST_3",
      "LASER_HEAVY_1",
      "LASER_HEAVY_2",
      "MISSILES_2",
      "MISSILES_BREACH",
      "BEAM_1",
      "BEAM_2",
      "BEAM_3",
      "BEAM_LONG",
      "BEAM_FIRE",
      "BOMB_FIRE",
      "ION_1",
      "ION_4",
    ],
    crewMax: 7,
  };
}
