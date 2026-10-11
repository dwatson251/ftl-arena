import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout } from "@ftl/sim";
import { copyName, isSame, PresetStore, type Preset } from "../apps/client/src/presets.ts";

const mem = (initial: unknown = []) => {
  const b = { data: initial as unknown, saves: 0, load: () => b.data, save: (l: Preset[]) => { b.data = JSON.parse(JSON.stringify(l)); b.saves++; } };
  return b;
};
const db = placeholderDb();
const ship = Object.keys(db.ships)[0];

describe("ship presets", () => {
  it("save, list newest first, survive a reload, and delete", async () => {
    const b = mem();
    const s = new PresetStore(b);
    await s.init();
    expect(s.list()).toEqual([]);
    const a = s.save("First", baseLoadout(db, ship));
    const c = s.save("Second", baseLoadout(db, ship));
    expect(s.list().map((p) => p.name)).toEqual(["Second", "First"]);
    expect(b.saves).toBe(2);
    // A fresh store over the same file sees both, with the backdrop each was saved with.
    const s2 = new PresetStore(b);
    await s2.init();
    expect(s2.get(a.id)?.look).toEqual(a.look);
    s2.remove(c.id);
    expect(s2.list().map((p) => p.name)).toEqual(["First"]);
  });

  it("a corrupt or odd store reads as no presets (or just the good ones)", async () => {
    for (const bad of ["nonsense", null, { a: 1 }, [{ id: 3 }]]) {
      const s = new PresetStore(mem(bad));
      await s.init();
      expect(s.list()).toEqual([]);
    }
    const s = new PresetStore({ load: () => { throw new Error("disk"); }, save: () => {} });
    await s.init();
    expect(s.list()).toEqual([]);
  });

  it("knows an unchanged build from a changed one", () => {
    const l = baseLoadout(db, ship);
    expect(isSame(l, JSON.parse(JSON.stringify(l)))).toBe(true);
    expect(isSame(l, { ...l, systems: { ...l.systems, ["nosuch" as "shields"]: undefined } })).toBe(true);
    expect(isSame(l, { ...l, missiles: l.missiles + 1 })).toBe(false);
    if (l.crew[0]) expect(isSame(l, { ...l, crew: [{ ...l.crew[0], name: "Someone Else" }, ...l.crew.slice(1)] })).toBe(false);
    expect(isSame(l, { ...l, weapons: [...l.weapons, "X"] })).toBe(false);
  });

  it("copies are named '<name> - Copy'; blank names get a default", async () => {
    expect(copyName("Kestrel Rush")).toBe("Kestrel Rush - Copy");
    const s = new PresetStore(mem());
    await s.init();
    expect(s.save("   ", baseLoadout(db, ship)).name).toBe("Unnamed ship");
  });
});

describe("presets per Scrap costs mode", () => {
  it("shows only presets built under the lobby's Scrap costs, plus FTL-save ships (valid in any)", async () => {
    const db2 = placeholderDb();
    const ship = Object.keys(db2.ships)[0];
    const mem: { list: Preset[] } = { list: [] };
    const store = new PresetStore({ load: () => mem.list, save: (l) => void (mem.list = l) });
    await store.init();
    store.save("Plain", baseLoadout(db2, ship), Math.random, "none");
    store.save("Tour", baseLoadout(db2, ship), Math.random, "tournament");
    store.save("FromSave", { ...baseLoadout(db2, ship), origin: "ftl" }, Math.random, "ships");
    const names = (costs: "none" | "ships" | "tournament") => store.list(costs).map((p) => p.name).sort();
    expect(names("none")).toEqual(["FromSave", "Plain"]);
    expect(names("tournament")).toEqual(["FromSave", "Tour"]);
    expect(names("ships")).toEqual(["FromSave"]);
    expect(store.list().length).toBe(3);
    // A preset from before modes existed counts as "none".
    mem.list.push({ ...mem.list[0], id: "old", name: "Old", costs: undefined });
    const again = new PresetStore({ load: () => mem.list, save: () => {} });
    await again.init();
    expect(again.list("none").map((p) => p.name)).toContain("Old");
    expect(again.list("ships").map((p) => p.name)).not.toContain("Old");
  });
});
