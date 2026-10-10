import type { SystemId } from "@ftl/data";
import type { WeaponTarget } from "./state.ts";

/** Every player action. The UI, the bot and the bench all speak only this. */
export type Command =
  | { c: "power"; system: SystemId; delta: 1 | -1 }
  | { c: "weaponPower"; slot: number; on: boolean }
  | { c: "target"; slot: number; target: WeaponTarget | null }
  | { c: "autofire"; slot: number; on: boolean }
  | { c: "moveCrew"; crew: number[]; room: number }
  | { c: "door"; door: number; open: boolean }
  | { c: "doorsAll"; open: boolean }
  /** Swap two weapon slots (moves the weapons between mounts, keeping their charge). */
  | { c: "swapWeapons"; a: number; b: number }
  /** Power a drone slot on (deploys it, using a drone part) or off (the deployed drone is lost). */
  | { c: "dronePower"; slot: number; on: boolean };
