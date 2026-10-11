/** The browser only needs types and a few pure helpers from the sim. */
export { RULES, SURVIVAL, usable } from "@ftl/sim";
export type { Command, MatchView, ShipView, WeaponTarget } from "@ftl/sim";
import { SNAP_EVERY } from "@ftl/protocol";
import { TICK_HZ } from "@ftl/sim";
export const SNAP_HZ = TICK_HZ / SNAP_EVERY;
