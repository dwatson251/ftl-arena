/** Engi Bomber (Engi Bomber). */
import type { ShipConfig } from "../types.ts";
import L_circle_bomber from "../layouts/circle_bomber.ts";

export default class CIRCLE_BOMBER implements ShipConfig {
  readonly id = "CIRCLE_BOMBER";
  readonly title = "Engi Bomber";
  readonly className = "Engi Bomber";
  readonly health = 9;
  readonly reactor = 8;
  readonly weaponSlots = 4;
  readonly droneSlots = 0;
  readonly systems: ShipConfig["systems"] = [
    { id: "pilot", room: 1, power: 1, start: true, station: 0, max: 3 },
    { id: "doors", room: 2, power: 1, start: false, station: 0, max: 3 },
    { id: "medbay", room: 4, power: 1, start: false, station: 1, max: 3 },
    { id: "oxygen", room: 3, power: 1, start: true, station: -1, max: 3 },
    { id: "shields", room: 7, power: 2, start: true, station: 0, max: 10 },
    { id: "engines", room: 9, power: 1, start: true, station: 0, max: 5 },
    { id: "weapons", room: 11, power: 2, start: true, station: 0, max: 10 },
    { id: "drones", room: 5, power: 2, start: true, station: -1, max: 8 },
  ];
  readonly loadout: ShipConfig["loadout"] = {
    crew: ["engi", "engi", "engi"],
    crewCount: 3,
    crewRace: "engi",
    weapons: [],
    drones: [],
    augments: ["NANO_MEDBAY"],
    missiles: 10,
    droneParts: 4,
  };
  readonly layout = L_circle_bomber;
  readonly sprites: ShipConfig["sprites"] = { dir: "ships_glow", img: "circle_bomber", cloak: "circle_bomber" };
  readonly enemy: ShipConfig["enemy"] = {
    scale: 1,
    // The bubble read high by eye (playtest, tuned from 2x close-ups).
    shieldNudge: { y: 10 },
    single: true,
    weaponPool: [
      "LASER_BURST_1",
      "LASER_BURST_2_A",
      "LASER_BURST_3",
      "LASER_HEAVY_1",
      "BEAM_1",
      "BEAM_2",
      "BEAM_3",
      "BEAM_LONG",
      "BEAM_FIRE",
      "ION_1",
      "ION_2",
      "ION_4",
    ],
    crewMax: 6,
  };
}
