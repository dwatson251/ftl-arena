/** Slug Light-Cruiser (Slug Light-Cruiser). */
import type { ShipConfig } from "../types.ts";
import L_jelly_croissant from "../layouts/jelly_croissant.ts";

export default class JELLY_CROISSANT implements ShipConfig {
  readonly id = "JELLY_CROISSANT";
  readonly title = "Slug Light-Cruiser";
  readonly className = "Slug Light-Cruiser";
  readonly health = 10;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 0, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 5, power: 1, start: false, station: 0, max: 3 },
    { id: "oxygen", room: 4, power: 1, start: true, station: -1, max: 3 },
    { id: "medbay", room: 6, power: 1, start: false, station: 1, max: 3 },
    { id: "shields", room: 3, power: 2, start: true, station: 0, max: 10 },
    { id: "engines", room: 7, power: 1, start: true, station: 0, max: 6 },
    { id: "weapons", room: 1, power: 2, start: true, station: 0, max: 8 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["slug", "slug", "slug"],
    crewCount: 3,
    crewRace: "slug",
    weapons: [],
    drones: [],
    augments: ["SLUG_GEL"],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_jelly_croissant;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "jelly_croissant", cloak: "jelly_croissant" };
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
    crewMax: 6,
  };
}
