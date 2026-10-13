import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPresentation } from "@ftl/data";
import { buildDb, HANGAR, SHIPS, SYSTEMS } from "@ftl/content";
import { loadFtlDb } from "@ftl/extract";

const A = "assets-local";
const real = existsSync(join(A, "data/blueprints.xml"));
const read = (p: string) => (existsSync(join(A, p)) ? readFileSync(join(A, p), "utf8") : undefined);

describe("content classes", () => {
  it("cover every hangar hull, with its layout, systems and stock loadout", () => {
    const db = buildDb();
    expect(db.hangar.length).toBe(28);
    for (const id of HANGAR) {
      const s = db.ships[id];
      expect(s, id).toBeTruthy();
      expect(db.layouts[s.layout]?.rooms.length, id).toBeGreaterThan(0);
      for (const w of s.weapons) expect(db.weapons[w], `${id} ${w}`).toBeTruthy();
      for (const sys of s.systems) expect(db.layouts[s.layout].rooms.some((r) => r.id === sys.room), `${id} ${sys.id}`).toBe(true);
    }
    expect(SHIPS.every((s) => s.enemy.scale > 0)).toBe(true);
  });

  // The classes were generated from FTL's own data: with the install's presentation added back, the DB is the
  // same one the old parser built.
  it.runIf(real)("rebuild exactly the DB parsed from the install's data files", () => {
    const old = loadFtlDb(A);
    const db = buildDb(buildPresentation(read));
    // Systems FTL describes inline (no text ids) carry our own description instead of FTL's.
    const ownDesc = new Set(SYSTEMS.filter((s) => s.desc).map((s) => s.id));
    for (const id of ownDesc) old.systems[id] = { ...old.systems[id], desc: db.systems[id].desc };
    // Our own per-ship tuning (target-window scale, shield nudge) isn't in FTL's data.
    for (const s of Object.values(db.ships)) {
      delete s.viewScale;
      delete s.shieldNudge;
    }
    for (const k of ["weapons", "droneBPs", "crew", "augments", "systems", "ships", "layouts"] as const) {
      for (const id of Object.keys(old[k])) expect((db[k] as Record<string, unknown>)[id], `${k}.${id}`).toEqual((old[k] as Record<string, unknown>)[id]);
      expect(Object.keys(db[k]).sort(), k).toEqual(Object.keys(old[k]).sort());
    }
    expect(db.hangar).toEqual(old.hangar);
    expect(db.enemies).toEqual(old.enemies);
    for (const k of ["animSheets", "weaponAnims", "anims", "sounds", "music", "names", "femaleNames", "reactorDesc", "source"] as const) expect(db[k], k).toEqual(old[k]);
  });
});
