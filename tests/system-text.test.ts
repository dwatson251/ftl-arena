import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadDb } from "@ftl/extract";

// Needs the owner's extracted FTL data (assets-local/); skipped on a fresh clone.
describe.runIf(existsSync("assets-local/data/text_misc.xml"))("FTL's system descriptions", () => {
  it("come from the game's text with a line per level", () => {
    const db = loadDb("assets-local");
    expect(db.systems.shields.desc).toMatch(/barrier/i);
    expect(db.systems.shields.levels?.[1]).toMatch(/One Shield Barrier/);
    expect(db.systems.shields.levels?.[0]).toBe("");
    expect(db.systems.sensors.levels?.[0]).toMatch(/interior/i);
    // Templates keep FTL's placeholders for the hangar to fill in.
    expect(db.systems.cloaking.levels?.[0]).toContain("\\1");
    expect(db.reactorDesc).toMatch(/power/i);
  });
});
