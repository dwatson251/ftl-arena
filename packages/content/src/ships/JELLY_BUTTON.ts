/** Slug Interceptor (Slug Interceptor). */
import type { ShipConfig } from "../types.ts";
import L_jelly_button from "../layouts/jelly_button.ts";

export default class JELLY_BUTTON implements ShipConfig {
  readonly id = "JELLY_BUTTON";
  readonly title = "Slug Interceptor";
  readonly className = "Slug Interceptor";
  readonly health = 9;
  readonly reactor = 7;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "oxygen", room: 3, power: 1, start: true, station: -1, max: 3 },
    { id: "pilot", room: 0, power: 1, start: true, station: 0, max: 3 },
    { id: "shields", room: 1, power: 2, start: true, station: 0, max: 8 },
    { id: "engines", room: 4, power: 1, start: true, station: 0, max: 8 },
    { id: "weapons", room: 2, power: 2, start: true, station: 0, max: 8 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["slug", "slug"],
    crewCount: 2,
    crewRace: "slug",
    weapons: [],
    drones: [],
    augments: ["SLUG_GEL"],
    missiles: 10,
    droneParts: 0,
  };
  readonly layout = L_jelly_button;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "jelly_button", cloak: "jelly_button" };
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
    crewMax: 3,
  };
}
