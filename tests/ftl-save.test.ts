import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { placeholderDb, type GameDB } from "@ftl/data";
import { loadDb } from "@ftl/extract";
import { baseLoadout, buildShip, RULES } from "@ftl/sim";
import { findFtlSave, ftlSaveToLoadout, importFtlSave, readFtlSave } from "../apps/server/src/ftlsave.ts";
import { isSame } from "../apps/client/src/presets.ts";

/** Writes a continue.sav the way FTL lays it out (only as far as the player ship), for a given format. */
function writeSave(db: GameDB, format: number, o: { ship: string; crew: { name: string; race: string; xp: number[]; drone?: boolean }[]; systems: Record<string, number>; reactor: number; weapons: string[]; drones: string[]; augments: string[]; missiles: number; parts: number }, badBool = false): Buffer {
  const out: Buffer[] = [];
  const int = (v: number) => {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v);
    out.push(b);
  };
  const bool = (v: boolean) => int(v ? 1 : 0);
  const str = (s: string) => {
    const b = Buffer.from(s, format >= 11 ? "utf8" : "latin1");
    int(b.length);
    out.push(b);
  };
  const ae = format >= 7;
  const bp = db.ships[o.ship];
  const L = db.layouts[bp.layout];
  int(format);
  if (format === 11) bool(false);
  if (ae) bool(true);
  int(1);
  for (let i = 0; i < 4; i++) int(i);
  str("The Test");
  str(o.ship);
  int(1);
  int(0);
  int(1);
  str("var");
  int(3);
  str(o.ship);
  str("The Test");
  str("art");
  int(1);
  str("human");
  str("Start");
  if (ae) {
    bool(false);
    int(10);
    bool(false);
    int(0);
  }
  int(30); // hull
  int(5); // fuel
  int(o.parts);
  int(o.missiles);
  int(99); // scrap
  int(o.crew.length);
  for (const c of o.crew) {
    str(c.name);
    str(c.race);
    bool(!!c.drone);
    for (const v of [100, 10, 20, 0, 0]) int(v);
    bool(true);
    if (ae) {
      int(0);
      int(-1);
      int(1);
      int(4);
      bool(false);
      int(0);
      int(0);
    }
    for (const x of c.xp) int(x);
    bool(true);
    for (let i = 0; i < 5; i++) int(0);
    if (ae) {
      for (let i = 0; i < 6; i++) int(0);
      if (format >= 8) for (let i = 0; i < 12; i++) bool(false);
      bool(false);
      bool(true);
      bool(false);
      for (let i = 0; i < 5; i++) int(0);
      bool(false);
      if (c.race === "crystal") for (let i = 0; i < 3; i++) int(0);
    }
  }
  int(o.reactor);
  const order = ["shields", "engines", "oxygen", "weapons", "drones", "medbay", "pilot", "sensors", "doors", "teleporter", "cloaking", "artillery", ...(ae ? ["battery", "clonebay", "mind", "hacking"] : [])];
  for (const id of order) {
    const cap = o.systems[id] ?? 0;
    int(cap);
    if (cap > 0) {
      for (let i = 0; i < 6; i++) int(i === 0 ? cap : 0);
      if (ae) {
        int(0);
        int(0);
        if (badBool && id === "shields") int(5);
        else bool(false);
        int(0);
        int(0);
        int(0);
      }
    }
  }
  if (ae) {
    if ((o.systems.clonebay ?? 0) > 0) for (let i = 0; i < 3; i++) int(0);
    if ((o.systems.battery ?? 0) > 0) {
      bool(false);
      int(0);
      int(0);
    }
    for (let i = 0; i < 4; i++) int(0);
    for (let i = 0; i < 3; i++) {
      bool(false);
      int(0);
    }
    int(0);
    int(0);
    if ((o.systems.cloaking ?? 0) > 0) for (let i = 0; i < 4; i++) int(0);
  }
  for (const r of [...L.rooms].sort((a, b) => a.id - b.id)) {
    int(100);
    for (let i = 0; i < r.w * r.h * 3; i++) int(0);
    if (ae) {
      int(0);
      int(4);
    }
  }
  int(0); // breaches
  for (let d = 0; d < L.doors.length; d++) {
    if (ae) for (let i = 0; i < 3; i++) int(1);
    bool(false);
    bool(false);
    if (ae) {
      int(0);
      int(0);
    }
  }
  if (ae) int(0);
  if (format >= 8) int(0);
  int(o.weapons.length);
  for (const w of o.weapons) {
    str(w);
    bool(true);
    if (format === 2) int(0);
  }
  int(o.drones.length);
  for (const d of o.drones) {
    str(d);
    bool(true);
    bool(true);
    for (let i = 0; i < 5; i++) int(0);
  }
  int(o.augments.length);
  for (const a of o.augments) str(a);
  int(0); // (cargo and the rest of the run follow; the reader stops before them)
  return Buffer.concat(out);
}

const db = placeholderDb();
const ship = "PH_SKIFF";
const weapon = Object.keys(db.weapons)[0];
const sample = {
  ship,
  crew: [
    { name: "Ace", race: "human", xp: [30, 15, 0, 130, 4, 16] },
    { name: "Bolt", race: "engi", xp: [0, 0, 55, 0, 36, 0] },
    { name: "Drone", race: "battle", xp: [0, 0, 0, 0, 0, 0], drone: true },
    { name: "Overflow", race: "human", xp: [999, 0, 0, 0, 0, -5] },
  ],
  systems: { shields: 4, engines: 3, oxygen: 1, weapons: 3, pilot: 2, sensors: 1, doors: 1, medbay: 1 },
  reactor: 12,
  weapons: [weapon, "NOT_A_WEAPON"],
  drones: [],
  augments: ["NOT_AN_AUGMENT"],
  missiles: 7,
  parts: 3,
};

describe("Load from FTL (continue.sav)", () => {
  for (const format of [11, 9, 8, 7, 2]) {
    it(`reads the player ship from a format ${format} save`, () => {
      const save = readFtlSave(writeSave(db, format, sample), db);
      expect(save.blueprint).toBe(ship);
      expect(save.reactor).toBe(12);
      expect(save.missiles).toBe(7);
      expect(save.droneParts).toBe(3);
      expect(save.systems.shields).toBe(4);
      expect(save.weapons).toEqual([weapon, "NOT_A_WEAPON"]);
      expect(save.crew.map((c) => c.name)).toEqual(["Ace", "Bolt", "Drone", "Overflow"]);
      expect(save.crew[0].xp).toEqual({ pilot: 30, engines: 15, shields: 0, weapons: 130, repair: 4, combat: 16 });
    });
  }

  it("maps it to a loadout: systems, reactor, weapons, crew with skills; drones and unknowns dropped with notes", () => {
    const { loadout, notes } = ftlSaveToLoadout(readFtlSave(writeSave(db, 11, sample), db), db);
    expect(loadout.ship).toBe(ship);
    expect(loadout.reactor).toBe(12);
    expect(loadout.missiles).toBe(7);
    expect(loadout.droneParts).toBe(3);
    expect(loadout.weapons).toEqual([weapon]);
    expect(loadout.augments).toEqual([]);
    expect(loadout.crew.map((c) => c.name)).toEqual(["Ace", "Bolt", "Overflow"]);
    expect(loadout.crew[0].xp?.weapons).toBe(130);
    // Out-of-range experience is clamped to the skill's maximum.
    expect(loadout.crew[2].xp?.pilot).toBe(RULES.skillXp.pilot[1]);
    expect(loadout.crew[2].xp?.combat).toBe(0);
    expect(notes.join(" ")).toMatch(/NOT_A_WEAPON/);
    expect(notes.join(" ")).toMatch(/NOT_AN_AUGMENT/);
  });

  it("refuses broken saves with a reason", () => {
    const good = writeSave(db, 11, sample);
    expect(() => readFtlSave(good.subarray(0, 200), db)).toThrow();
    expect(() => readFtlSave(writeSave(db, 11, sample, true), db)).toThrow(/yes\/no/);
    expect(() => readFtlSave(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), db)).toThrow();
    const dir = mkdtempSync(join(tmpdir(), "ftlsave-"));
    writeFileSync(join(dir, "continue.sav"), Buffer.from("not a save"));
    const r = importFtlSave(db, { FTL_SAVE: dir });
    expect(r.ok).toBe(false);
    expect(importFtlSave(db, { FTL_SAVE: join(dir, "missing") }).ok).toBe(false);
    writeFileSync(join(dir, "continue.sav"), good);
    expect(importFtlSave(db, { FTL_SAVE: dir }).ok).toBe(true);
  });

  it("imported skills start the battle: crew begin with their experience", () => {
    const { loadout } = ftlSaveToLoadout(readFtlSave(writeSave(db, 11, sample), db), db);
    const s = buildShip(db, loadout, 0, "me", () => "x");
    expect(s.crew[0].xp.weapons).toBe(130);
    expect(s.crew[1].xp.repair).toBe(36);
    // A build without imported skills is unchanged.
    expect(buildShip(db, baseLoadout(db, ship), 0, "me", () => "x").crew.every((c) => Object.values(c.xp).every((v) => v === 0))).toBe(true);
  });

  it("a change in skills counts as a change to a preset", () => {
    const { loadout } = ftlSaveToLoadout(readFtlSave(writeSave(db, 11, sample), db), db);
    const other = structuredClone(loadout);
    other.crew[0].xp = { ...other.crew[0].xp, pilot: 0 };
    expect(isSame(loadout, structuredClone(loadout))).toBe(true);
    expect(isSame(loadout, other)).toBe(false);
  });

  // This machine's own run, if there is one (never committed; skipped elsewhere).
  const real = findFtlSave();
  it.runIf(!!real && existsSync("assets-local/manifest.json"))("reads this machine's real FTL save", () => {
    const fdb = loadDb("assets-local");
    const r = importFtlSave(fdb);
    expect(r.ok, r.reason).toBe(true);
    expect(fdb.hangar).toContain(r.loadout!.ship);
    expect(r.loadout!.crew.length).toBeGreaterThan(0);
  });
});
