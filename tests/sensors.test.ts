import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match, viewFor } from "@ftl/sim";

const db = placeholderDb();
const lo = (sensors: number) => {
  const b = baseLoadout(db, "PH_SKIFF");
  return { ...b, systems: { ...b.systems, sensors } };
};
const match = (sensors: number) => new Match(db, DEFAULT_CONFIG, [lo(sensors), lo(1)], ["a", "b"]);

describe("sensors (FTL's levels)", () => {
  it("2 shows the enemy interior, 3 their weapons' charge, 4 (manned 3) their systems' power and ion", () => {
    for (const lv of [1, 2, 3]) {
      const m = match(lv);
      m.step();
      const en = viewFor(m, 0).ships[1];
      expect(en.interior).toBe(lv >= 2);
      expect(en.weaponsKnown).toBe(lv >= 3);
      expect(en.systemsKnown).toBe(false);
      expect(Object.values(en.systems).every((s) => !s || s.power === -1)).toBe(true);
    }
    const m = match(3);
    m.step();
    m.state.ships[0].systems.sensors!.manBonus = 1;
    expect(viewFor(m, 0).ships[1].systemsKnown).toBe(true);
  });
  it("a cloaked enemy hides its interior, but level-2 sensors still read its crew", () => {
    const m = match(2);
    m.step();
    m.state.ships[1].cloak = { t: 5, cd: 0 };
    const en = viewFor(m, 0).ships[1];
    expect(en.interior).toBe(false);
    expect(en.crew.length).toBe(m.state.ships[1].crew.length);
    expect(en.crew.every((c) => !c.blip && c.name)).toBe(true);
  });
  it("telepathy (the Lifeform Scanner) senses unseen crew as silhouettes: race and action, no name or health", () => {
    const m = match(1);
    // (The placeholder data has no augment list, so fit it directly.)
    m.state.ships[0].augments = ["LIFE_SCANNER"];
    m.step();
    const en = viewFor(m, 0).ships[1];
    expect(en.crew.length).toBeGreaterThan(0);
    for (const c of en.crew) {
      expect(c.blip).toBe(true);
      expect(c.race).toBe(m.state.ships[1].crew.find((q) => q.id === c.id)!.race);
      expect(c.name).toBe("");
    }
    // Without it, nothing.
    const plain = match(1);
    plain.step();
    expect(viewFor(plain, 0).ships[1].crew.length).toBe(0);
  });
  it("a Slug sees into every room touching its own (no sensors needed)", () => {
    const m = new Match(db, DEFAULT_CONFIG, [{ ...lo(0), crew: [{ name: "Sly", race: "slug" }] }, lo(1)], ["a", "b"]);
    m.step();
    const s = m.state.ships[0];
    const g = m.geo(s);
    const slug = s.crew[0];
    const room = g.tiles.get(slug.tile)!.room;
    const touching = new Set<number>();
    for (const t of g.roomTiles.get(room)!) {
      const [x, y] = t.split(",").map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = g.tiles.get(`${x + dx},${y + dy}`)?.room;
        if (r !== undefined) touching.add(r);
      }
    }
    const v = viewFor(m, 0).ships[0];
    for (const r of touching) expect(v.visibleRooms).toContain(r);
    expect(v.visibleRooms!.length).toBeLessThan(s.rooms.length);
  });
});
