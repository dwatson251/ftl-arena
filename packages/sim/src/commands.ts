import type { SystemId } from "@ftl/data";
import type { WeaponTarget } from "./state.ts";

/** Every player action. The UI, the bot and the bench all speak only this. */
export type Command =
  | { c: "power"; system: SystemId; delta: 1 | -1 }
  | { c: "weaponPower"; slot: number; on: boolean }
  | { c: "target"; slot: number; target: WeaponTarget | null }
  | { c: "autofire"; slot: number; on: boolean }
  /** `enemy`: the room is on the enemy ship (moves own boarders aboard it). */
  | { c: "moveCrew"; crew: number[]; room: number; enemy?: boolean }
  | { c: "door"; door: number; open: boolean }
  | { c: "doorsAll"; open: boolean }
  /** Swap two weapon slots (moves the weapons between mounts, keeping their charge). */
  | { c: "swapWeapons"; a: number; b: number }
  /** Power a drone slot on (deploys it, using a drone part) or off (the deployed drone is lost). */
  | { c: "dronePower"; slot: number; on: boolean }
  /** Teleport own crew standing in the teleporter room to an enemy room / bring own crew back from one. */
  | { c: "teleport"; room: number }
  | { c: "retrieve"; room: number }
  | { c: "cloak" }
  /** Launch the hacking drone at an enemy room (uses a drone part), then pulse it. */
  | { c: "hackLaunch"; room: number }
  | { c: "hackPulse" }
  | { c: "battery" }
  /** Mind control one hostile crew member in a room (on the enemy ship, or an intruder at home). */
  | { c: "mind"; room: number; enemy: boolean }
  /** Point the artillery at an enemy room (null: random rooms). */
  | { c: "artilleryTarget"; room: number | null };
