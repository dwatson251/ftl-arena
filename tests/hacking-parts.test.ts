import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";
import { baseLoadout, priceLoadout } from "@ftl/sim";

const db = loadDb(existsSync("assets-local/manifest.json") ? "assets-local" : undefined);
// A hull that can take hacking (not in the placeholder set).
const hull = db.hangar.find((h) => db.ships[h].systems.some((x) => x.id === "hacking"));

describe("hacking and drone parts", () => {
  it.runIf(!!hull)("a build with hacking needs at least one drone part (the hacking drone uses one)", () => {
    const base = baseLoadout(db, hull!);
    const l = { ...base, systems: { ...base.systems, hacking: Math.max(1, base.systems.hacking ?? 0) } };
    const none = priceLoadout(db, { ...l, droneParts: 0 }, 99999);
    expect(none.errors.some((e) => /hacking needs at least 1 drone part/.test(e))).toBe(true);
    const one = priceLoadout(db, { ...l, droneParts: Math.max(1, base.droneParts ?? 0) }, 99999);
    expect(one.errors.some((e) => /hacking/.test(e))).toBe(false);
  });
});
