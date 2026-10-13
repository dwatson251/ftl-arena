/**
 * Arena rule modifiers: switches that combine with any Arena match (shown as one row of boxed toggles on the
 * Rules step). Each one declares which other modifiers it disables and when the lobby's own rules turn it off,
 * so the hangar can grey out what can't be picked and the server drops it.
 */
import type { GameDB } from "@ftl/data";
import { stockLoadout } from "./survival.ts";
import type { Loadout } from "./loadout.ts";
import type { MatchConfig } from "./state.ts";

export type ModId = "bare" | "noDrones" | "noAugments" | "noMissiles" | "crewOnly";

export interface ModifierDef {
  id: ModId;
  label: string;
  tip: string;
  /** Other modifiers this one switches off (they can't be picked while it's on). */
  disables: ModId[];
  /** The lobby's own rules that switch it off (with the reason shown), or null. */
  offBy?: (c: MatchConfig) => string | null;
  /** Hangar steps it closes. */
  locks?: string[];
}

export const MODIFIERS: ModifierDef[] = [
  {
    id: "bare", label: "Bare", tip: "Every captain flies their hull's stock loadout: no building at all.",
    disables: ["noDrones", "noAugments", "noMissiles"],
    offBy: (c) => (c.ftlOnly ? "Bring your own ship flies your FTL save's ship" : null),
    locks: ["Presets", "Systems", "Weapons", "Drones", "Crew", "Augments"],
  },
  { id: "noDrones", label: "No drones", tip: "No drones on any ship.", disables: [], locks: ["Drones"] },
  { id: "noAugments", label: "No augments", tip: "No augments on any ship.", disables: [], locks: ["Augments"] },
  { id: "noMissiles", label: "No missiles", tip: "No missile weapons or bombs, and no missiles.", disables: [] },
  {
    id: "crewOnly", label: "Crew combat only",
    tip: "Every ship gets a teleporter, and hulls take no damage: win by killing the crew. Stun, fire, bombs and system damage still work.",
    disables: [],
    offBy: (c) => (c.winCondition === "auto" ? "Autonomous ships fly without crew" : null),
  },
];

const byId = new Map(MODIFIERS.map((m) => [m.id, m]));

/** Why a modifier can't be picked under these rules and these other picks (null: it can). */
export function modBlocked(id: ModId, c: MatchConfig, mods: ModId[] = c.mods ?? []): string | null {
  if (c.survival) return "Survival sets its own rules";
  const def = byId.get(id);
  if (!def) return "unknown";
  const off = def.offBy?.(c);
  if (off) return off;
  const by = MODIFIERS.find((m) => m.id !== id && mods.includes(m.id) && m.disables.includes(id));
  return by ? `${by.label} is on` : null;
}

/** The modifiers that hold: known ones, in table order, each kept only if nothing kept before it disables it. */
export function cleanMods(c: MatchConfig, mods: unknown): ModId[] {
  const want = new Set((Array.isArray(mods) ? mods : []).map(String));
  const kept: ModId[] = [];
  for (const m of MODIFIERS) if (want.has(m.id) && !modBlocked(m.id, c, kept)) kept.push(m.id);
  return kept;
}

export const hasMod = (c: Pick<MatchConfig, "mods"> | undefined, id: ModId) => !!c?.mods?.includes(id);

/** A loadout made to fit the modifiers: Bare is the stock fit; the "No ..." ones take their things out. */
export function applyMods(db: GameDB, l: Loadout, mods: ModId[]): Loadout {
  let out = mods.includes("bare") ? { ...stockLoadout(db, l.ship), crew: l.crew.length ? stockLoadout(db, l.ship).crew.map((c, i) => ({ ...c, name: l.crew[i]?.name ?? c.name })) : stockLoadout(db, l.ship).crew } : { ...l };
  if (mods.includes("noDrones")) out = { ...out, drones: [] };
  if (mods.includes("noAugments")) out = { ...out, augments: [] };
  if (mods.includes("noMissiles")) out = { ...out, weapons: out.weapons.filter((w) => !(db.weapons[w]?.missiles > 0)), missiles: 0 };
  return out;
}

/** What a loadout breaks under the modifiers (the price check's errors). */
export function modErrors(db: GameDB, l: Loadout, mods: ModId[]): string[] {
  const e: string[] = [];
  if (mods.includes("noDrones") && (l.drones ?? []).length) e.push("No drones: take the drones off");
  if (mods.includes("noAugments") && (l.augments ?? []).length) e.push("No augments: take the augments off");
  if (mods.includes("noMissiles") && (l.weapons.some((w) => db.weapons[w]?.missiles > 0) || l.missiles > 0)) e.push("No missiles: no missile weapons, bombs or missiles");
  return e;
}
