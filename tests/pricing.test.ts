import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";
import { baseLoadout, DEFAULT_CONFIG, itemPrice, obtainable, priceLoadout, PRICING, shipPrice, stockValue, systemStepPrice } from "@ftl/sim";
import { Lobby, sanitizeConfig, type Client } from "../apps/server/src/lobby.ts";

const real = existsSync("assets-local/manifest.json");
const db = loadDb();
const kestrel = db.hangar.includes("PLAYER_SHIP_HARD") ? "PLAYER_SHIP_HARD" : db.hangar[0];
const BIG = 1e9;

describe("Scrap costs", () => {
  it("None: prices as before (the stock hull is free)", () => {
    expect(priceLoadout(db, baseLoadout(db, kestrel), 400).total).toBe(0);
    expect(priceLoadout(db, baseLoadout(db, kestrel), 400, [], false, false, { costs: "none" }).total).toBe(0);
  });

  it("Ship expenses: every hull costs its stock value plus its premiums", () => {
    for (const id of db.hangar.slice(0, 6)) {
      const l = baseLoadout(db, id);
      const p = priceLoadout(db, l, BIG, [], false, false, { costs: "ships" });
      expect(p.total).toBe(shipPrice(db, id, l));
      expect(p.total).toBeGreaterThanOrEqual(stockValue(db, l));
    }
    if (real) {
      const b = baseLoadout(db, "PLAYER_SHIP_FED_2");
      expect(shipPrice(db, "PLAYER_SHIP_FED_2", b)).toBe(stockValue(db, b) + PRICING.premium.B + PRICING.raceTier.FED);
    }
  });

  it("Tournament: weapons and augments are priced by rarity (weapons dearer still)", () => {
    const w5 = Object.values(db.weapons).find((w) => w.rarity === 5 && w.cost > 0);
    const w1 = Object.values(db.weapons).find((w) => w.rarity === 1 && w.cost > 0);
    const k = PRICING.tournament.weaponMult;
    if (w5) expect(itemPrice(db, "weapon", w5.id, "tournament")).toBe(Math.round(w5.cost * 1.5 * k));
    if (w1) expect(itemPrice(db, "weapon", w1.id, "tournament")).toBe(Math.round(w1.cost * 0.9 * k));
    if (w5) expect(itemPrice(db, "weapon", w5.id, "ships")).toBe(w5.cost);
  });

  it("unobtainable items off: no buying them, but a hull's stock ones can come back (no extra copies)", () => {
    const rules = { costs: "tournament" as const, unobtainable: false };
    // A rarity-0 augment that isn't on the hull is refused.
    const banned = Object.values(db.augments).find((a) => !obtainable(db, "augments", a.id));
    if (banned) {
      const l = { ...baseLoadout(db, kestrel), augments: [banned.id] };
      expect(priceLoadout(db, l, BIG, [], false, false, rules).errors.join(" ")).toMatch(/normal run/);
      expect(priceLoadout(db, l, BIG, [], false, false, { costs: "none", unobtainable: true }).errors.join(" ")).not.toMatch(/normal run/);
      // The same ban without Tournament prices (the rules checkbox on its own).
      expect(priceLoadout(db, l, BIG, [], false, false, { costs: "none", unobtainable: false }).errors.join(" ")).toMatch(/normal run/);
    }
    // A hull whose stock fit carries an unobtainable augment: removing it and putting it back is fine, a second copy isn't.
    const hull = db.hangar.find((id) => (baseLoadout(db, id).augments ?? []).some((a) => !obtainable(db, "augments", a) && db.augments[a]?.stackable));
    const hull2 = hull ?? db.hangar.find((id) => (baseLoadout(db, id).augments ?? []).some((a) => !obtainable(db, "augments", a)));
    if (hull2) {
      const stock = baseLoadout(db, hull2);
      const aug = stock.augments!.find((a) => !obtainable(db, "augments", a))!;
      expect(priceLoadout(db, { ...stock, augments: [] }, BIG, [], false, false, rules).ok).toBe(true);
      expect(priceLoadout(db, stock, BIG, [], false, false, rules).ok).toBe(true);
      const twice = { ...stock, augments: [...stock.augments!, aug] };
      expect(priceLoadout(db, twice, BIG, [], false, false, rules).errors.join(" ")).toMatch(/normal run|doesn't stack/);
    }
    // Crew: Slug, Crystal and Lanius are rarity 0 in FTL's stores but join through events, so they're allowed.
    if (real) expect(obtainable(db, "crew", "crystal")).toBe(true);
  });

  it("the lobby: Ship expenses raise the allowance to 1500; Survival has no costs; Tournament forces the ban", () => {
    const c: Client = { id: "H", name: "H", lobby: null, send: () => {} };
    const l = new Lobby("COST", "H", db, {}, true);
    l.join(c);
    expect(l.config.scrap).toBe(400);
    l.setConfig(c, { costs: "ships" });
    expect(l.config.scrap).toBe(PRICING.shipsBudget);
    // The practice bot still finds a valid fit paying for its hull.
    expect(l.players.find((p) => p.bot)?.priced?.ok).toBe(true);
    l.setConfig(c, { costs: "tournament", unobtainable: true });
    expect(l.config.unobtainable).toBe(false);
    expect(sanitizeConfig(db, { ...DEFAULT_CONFIG, costs: "ships", survival: true }, true).costs).toBe("none");
  });
});

describe("Tournament: big builds cost more and more", () => {
  const ship = "PLAYER_SHIP_HARD";
  const T = { costs: "tournament" as const, unobtainable: false };
  it("each extra weapon costs more than the one before; weapons are dearer than in other modes", () => {
    const base = baseLoadout(db, ship);
    const w = "LASER_BURST_1";
    const one = priceLoadout(db, { ...base, weapons: [...base.weapons, w] }, 99999, [], false, false, T).total;
    const two = priceLoadout(db, { ...base, weapons: [...base.weapons, w, w] }, 99999, [], false, false, T).total;
    const none = priceLoadout(db, { ...base, weapons: [...base.weapons, w] }, 99999, [], false, false, { costs: "ships" }).total;
    expect(two - one).toBeGreaterThan(one - priceLoadout(db, base, 99999, [], false, false, T).total);
    expect(one - priceLoadout(db, base, 99999, [], false, false, T).total).toBeGreaterThan(none - priceLoadout(db, base, 99999, [], false, false, { costs: "ships" }).total);
  });

  it("system levels rise exponentially", () => {
    const bp = db.systems.shields;
    expect(systemStepPrice(bp, 5, "tournament")).toBeGreaterThan(systemStepPrice(bp, 5, "none"));
    expect(systemStepPrice(bp, 1, "tournament")).toBe(systemStepPrice(bp, 1, "none"));
  });

  it("Crystal crew only come with a hull; Ship expenses still hires them", () => {
    const base = baseLoadout(db, ship);
    const l = { ...base, crew: [...base.crew, { race: "crystal", name: "Ruby" }] };
    expect(priceLoadout(db, l, 99999, [], false, false, T).errors.some((e) => /Crystal/i.test(e))).toBe(true);
    expect(priceLoadout(db, l, 99999, [], false, false, { costs: "ships" }).ok).toBe(true);
  });
});
