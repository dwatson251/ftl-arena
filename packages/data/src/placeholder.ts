/**
 * A tiny, original demo data set so the arena runs without an FTL install. Names, the hull layout and
 * prices are this project's own; the client draws it with flat shapes. Run `npm run extract` for the real
 * ships and art from your own copy of FTL.
 */
import type { GameDB, ShipLayout, SystemBP, WeaponBP } from "./types.ts";

const w = (p: Partial<WeaponBP> & Pick<WeaponBP, "id" | "title" | "type">): WeaponBP => ({
  damage: 1, shots: 1, sp: 0, fireChance: 0, breachChance: 0, stunChance: 0, ion: 0, sysDamage: 0, persDamage: 0,
  hullBust: false, cooldown: 10, power: 1, cost: 50, missiles: 0, length: 0, radius: 0, speed: 0, stun: 0,
  image: "", weaponArt: "", rarity: 1, chargeLevels: 1, ...p,
});

const weapons: WeaponBP[] = [
  w({ id: "PH_PULSE", title: "Pulse Cannon", type: "LASER", damage: 1, shots: 2, cooldown: 10, power: 1, cost: 50, fireChance: 1 }),
  w({ id: "PH_TRIPLE", title: "Triple Pulse", type: "LASER", damage: 1, shots: 3, cooldown: 12, power: 2, cost: 80, fireChance: 1 }),
  w({ id: "PH_HEAVY", title: "Heavy Pulse", type: "LASER", damage: 2, shots: 1, cooldown: 9, power: 1, cost: 55, fireChance: 2 }),
  w({ id: "PH_TORPEDO", title: "Torpedo", type: "MISSILES", damage: 2, sp: 5, missiles: 1, cooldown: 10, power: 1, cost: 45, fireChance: 1, breachChance: 1 }),
  w({ id: "PH_ION", title: "Ion Pulse", type: "LASER", damage: 0, ion: 1, cooldown: 8, power: 1, cost: 40 }),
  w({ id: "PH_LANCE", title: "Lance Beam", type: "BEAM", damage: 1, length: 60, cooldown: 12, power: 1, cost: 40 }),
  w({ id: "PH_SCATTER", title: "Scatter Gun", type: "BURST", damage: 1, shots: 3, radius: 60, cooldown: 21, power: 2, cost: 65 }),
  w({ id: "PH_CHARGE", title: "Breach Charge", type: "BOMB", damage: 0, sysDamage: 3, missiles: 1, cooldown: 17, power: 1, cost: 50, breachChance: 9 }),
];

const sys = (id: SystemBP["id"], maxPower: number, upgradeCost: number[], cost = 50): SystemBP => ({
  id, maxPower, startPower: 1, upgradeCost, cost,
});

const systems: SystemBP[] = [
  sys("shields", 8, [100, 20, 30, 40, 60, 80, 100], 125),
  sys("engines", 8, [10, 15, 30, 40, 60, 80, 120]),
  sys("oxygen", 3, [25, 50]),
  sys("weapons", 8, [40, 25, 35, 50, 75, 90, 100]),
  sys("medbay", 3, [35, 45]),
  sys("pilot", 3, [20, 50]),
  sys("sensors", 3, [25, 40]),
  sys("doors", 3, [35, 50]),
];

/** An original 13-room hull: a 3-wide spine with wings. */
const skiff: ShipLayout = {
  id: "ph_skiff", xOffset: 1, yOffset: 1, img: { x: -40, y: -40, w: 560, h: 330 }, floor: { x: 0, y: 0 },
  ellipse: { a: 320, b: 200, x: 0, y: 0 }, gibs: [], mounts: [
    { x: 380, y: 30, rotate: true, mirror: true }, { x: 380, y: 220, rotate: true, mirror: false },
    { x: 250, y: 30, rotate: true, mirror: true }, { x: 250, y: 220, rotate: true, mirror: false },
  ],
  rooms: [
    { id: 0, x: 12, y: 2, w: 2, h: 1 }, // pilot
    { id: 1, x: 10, y: 1, w: 2, h: 2 }, // shields
    { id: 2, x: 10, y: 3, w: 2, h: 2 }, // weapons
    { id: 3, x: 8, y: 2, w: 2, h: 2 }, // corridor hub
    { id: 4, x: 6, y: 1, w: 2, h: 2 }, // medbay
    { id: 5, x: 6, y: 3, w: 2, h: 2 }, // oxygen
    { id: 6, x: 4, y: 2, w: 2, h: 2 }, // doors
    { id: 7, x: 2, y: 1, w: 2, h: 2 }, // engines
    { id: 8, x: 2, y: 3, w: 2, h: 2 }, // sensors
    { id: 9, x: 0, y: 2, w: 2, h: 2 }, // aft airlock
  ],
  doors: [
    { x: 12, y: 2, a: 1, b: 0, vertical: true },
    { x: 10, y: 3, a: 1, b: 2, vertical: false },
    { x: 10, y: 2, a: 3, b: 1, vertical: true },
    { x: 10, y: 3, a: 3, b: 2, vertical: true },
    { x: 8, y: 2, a: 4, b: 3, vertical: true },
    { x: 8, y: 3, a: 5, b: 3, vertical: true },
    { x: 6, y: 2, a: 6, b: 4, vertical: true },
    { x: 6, y: 3, a: 6, b: 5, vertical: true },
    { x: 4, y: 2, a: 7, b: 6, vertical: true },
    { x: 4, y: 3, a: 8, b: 6, vertical: true },
    { x: 2, y: 2, a: 9, b: 7, vertical: true },
    { x: 2, y: 3, a: 9, b: 8, vertical: true },
    { x: 0, y: 3, a: -1, b: 9, vertical: true },
  ],
};

export function placeholderDb(): GameDB {
  return {
    source: "placeholder",
    weapons: Object.fromEntries(weapons.map((x) => [x.id, x])),
    systems: Object.fromEntries(systems.map((x) => [x.id, x])),
    crew: {
      human: { id: "human", title: "Human", cost: 45 },
      engi: { id: "engi", title: "Engi", cost: 45 },
      mantis: { id: "mantis", title: "Mantis", cost: 55 },
      rock: { id: "rock", title: "Rockman", cost: 55 },
      energy: { id: "energy", title: "Zoltan", cost: 60 },
      slug: { id: "slug", title: "Slug", cost: 45 },
    },
    ships: {
      PH_SKIFF: {
        id: "PH_SKIFF", title: "Arena Skiff", layout: "ph_skiff", img: "", weaponSlots: 4, weapons: ["PH_TORPEDO", "PH_TRIPLE"],
        missiles: 8, health: 30, maxPower: 8, crewCount: 3, crewRace: "human", crewRaces: ["human", "human", "human"],
        systems: [
          { id: "pilot", room: 0, power: 1, start: true, station: 1 },
          { id: "shields", room: 1, power: 2, start: true, station: 0 },
          { id: "weapons", room: 2, power: 3, start: true, station: 1 },
          { id: "medbay", room: 4, power: 1, start: true, station: -1 },
          { id: "oxygen", room: 5, power: 1, start: true, station: -1 },
          { id: "doors", room: 6, power: 1, start: true, station: 0 },
          { id: "engines", room: 7, power: 2, start: true, station: 0 },
          { id: "sensors", room: 8, power: 1, start: true, station: 2 },
        ],
      },
    },
    layouts: { ph_skiff: skiff },
    animSheets: {}, weaponAnims: {}, anims: {}, sounds: {}, names: [], hangar: ["PH_SKIFF"],
  };
}
