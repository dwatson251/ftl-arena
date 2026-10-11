/**
 * Scrap cost modifiers (Arena's "Scrap costs" rule) and the unobtainable-items ban. Every number lives in
 * PRICING, meant for tuning.
 * - "ships" (Ship Expenses): picking a hull costs scrap: its stock fit's value (crew, weapons, systems, drones,
 *   augments) plus a premium for how far into FTL it unlocks.
 * - "tournament": hulls cost the same, and bought weapons and augments are priced by their FTL rarity; items
 *   a normal run can't give you are banned (beyond the hull's own stock fit).
 */
import type { GameDB } from "@ftl/data";
import type { Loadout } from "./loadout.ts";

export type CostMode = "none" | "ships" | "tournament";

export const PRICING = {
  /** The allowance these modes start from (switching to them raises the scrap to this if it's lower). */
  shipsBudget: 1500,
  /** Share of the stock fit's value charged for a hull. */
  componentRate: 1,
  /** Later layouts (FTL unlocks the B and C layouts by achievements). */
  premium: { A: 0, B: 40, C: 70 } as Record<string, number>,
  /** How late each family unlocks in FTL. */
  raceTier: { HARD: 0, CIRCLE: 20, FED: 30, ENERGY: 30, MANTIS: 30, JELLY: 40, ROCK: 40, STEALTH: 50, ANAEROBIC: 60, CRYSTAL: 70 } as Record<string, number>,
  /** Tournament: multipliers on FTL's own cost, by store rarity. */
  rarity: { 1: 0.9, 2: 1, 3: 1.1, 4: 1.25, 5: 1.5 } as Record<number, number>,
  /** Banned beyond the stock fit when unobtainable items are off, on top of everything with rarity 0. */
  unobtainable: { weapons: [] as string[], augments: [] as string[], crew: [] as string[] },
  /** Rarity-0 items that a normal run does give you (events), so they stay allowed. */
  obtainable: { weapons: [] as string[], augments: [] as string[], crew: ["slug", "crystal", "anaerobic"] },
};

export interface PriceRules {
  costs?: CostMode;
  /** Unobtainable crew, weapons and augments allowed (true unless the rule's off, or Tournament). */
  unobtainable?: boolean;
}

/** A hull's family and layout from its id: PLAYER_SHIP_FED_2 → FED, B. */
function family(ship: string): { race: string; layout: string } {
  const m = /^PLAYER_SHIP_([A-Z]+?)(?:_(\d))?$/.exec(ship);
  return { race: m?.[1] ?? "", layout: m?.[2] === "2" ? "B" : m?.[2] === "3" ? "C" : "A" };
}

/** What a stock fit is worth: crew, weapons, systems (install and upgrades), drones and augments. */
export function stockValue(db: GameDB, l: Loadout): number {
  let v = l.crew.reduce((a, c) => a + (db.crew[c.race]?.cost ?? 0), 0);
  v += l.weapons.reduce((a, w) => a + (db.weapons[w]?.cost ?? 0), 0);
  v += (l.drones ?? []).reduce((a, d) => a + (db.droneBPs?.[d]?.cost ?? 0), 0);
  v += (l.augments ?? []).reduce((a, x) => a + (db.augments?.[x]?.cost ?? 0), 0);
  for (const [id, lv] of Object.entries(l.systems)) {
    const bp = db.systems[id];
    if (!bp || !lv) continue;
    v += bp.cost;
    for (let i = 1; i < lv; i++) v += bp.upgradeCost[i - 1] ?? 0;
  }
  return v;
}

/** A hull's price under Ship Expenses / Tournament (`stock`: the hull's stock loadout). */
export function shipPrice(db: GameDB, ship: string, stock: Loadout): number {
  const f = family(ship);
  return Math.round(stockValue(db, stock) * PRICING.componentRate) + (PRICING.premium[f.layout] ?? 0) + (PRICING.raceTier[f.race] ?? 0);
}

/** A weapon's or augment's price: FTL's cost, scaled by rarity in a Tournament. */
export function itemPrice(db: GameDB, kind: "weapon" | "augment", id: string, costs: CostMode = "none"): number {
  const bp = kind === "weapon" ? db.weapons[id] : db.augments?.[id];
  if (!bp) return 0;
  if (costs !== "tournament") return bp.cost;
  return Math.round(bp.cost * (PRICING.rarity[bp.rarity] ?? 1));
}

/** Can a normal FTL run give you this? Store rarity above 0, or let back in by PRICING.obtainable. */
export function obtainable(db: GameDB, kind: "weapons" | "augments" | "crew", id: string): boolean {
  if (PRICING.unobtainable[kind].includes(id)) return false;
  if (PRICING.obtainable[kind].includes(id)) return true;
  const r = kind === "weapons" ? db.weapons[id]?.rarity : kind === "augments" ? db.augments?.[id]?.rarity : db.crew[id]?.rarity;
  return (r ?? 1) > 0;
}
