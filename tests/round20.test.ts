import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match, usable } from "@ftl/sim";

const db = placeholderDb();
const b = baseLoadout(db, "PH_SKIFF");
const run = (m: Match, s: number) => {
  for (let i = 0; i < Math.round(s * 30); i++) m.step();
};

describe("playtest round 20: power comes back after repairs", () => {
  it("a damaged system powers back up to what the player gave it once it's repaired", () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const me = m.state.ships[0];
    run(m, 0.1);
    const sh = me.systems.shields!;
    const before = sh.power;
    expect(before).toBeGreaterThan(0);
    sh.damage = sh.level;
    run(m, 0.1);
    expect(sh.power).toBe(0);
    sh.damage = 0;
    run(m, 0.1);
    expect(sh.power).toBe(before);
  });

  it("guns switched off by damage come back on; one the player switched off stays off", () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const me = m.state.ships[0];
    run(m, 0.1);
    const on = me.weapons.filter((w) => w.powered);
    expect(on.length).toBeGreaterThan(0);
    const ws = me.systems.weapons!;
    ws.damage = ws.level;
    run(m, 0.1);
    expect(me.weapons.every((w) => !w.powered)).toBe(true);
    ws.damage = 0;
    run(m, 0.1);
    expect(on.every((w) => w.powered)).toBe(true);
    // Switched off by hand: no coming back.
    m.push(0, { c: "weaponPower", slot: on[0].slot, on: false });
    run(m, 0.1);
    ws.damage = ws.level;
    run(m, 0.1);
    ws.damage = 0;
    run(m, 0.1);
    expect(on[0].powered).toBe(false);
  });

  it("powering down a dead system cancels a bar it would get back", () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const me = m.state.ships[0];
    run(m, 0.1);
    const sh = me.systems.shields!;
    const before = sh.power;
    sh.damage = sh.level;
    run(m, 0.1);
    m.push(0, { c: "power", system: "shields", delta: -1 });
    run(m, 0.1);
    sh.damage = 0;
    run(m, 0.1);
    expect(sh.power).toBe(before - 1);
    expect(sh.power).toBeLessThanOrEqual(usable(sh));
  });
});

describe("playtest round 20: guns without power drop their target", () => {
  it("switched off by hand, or knocked out by damage, a gun stops aiming", () => {
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const me = m.state.ships[0];
    run(m, 0.1);
    const slot = me.weapons.findIndex((w) => w.powered);
    expect(slot).toBeGreaterThanOrEqual(0);
    m.push(0, { c: "target", slot, target: { kind: "room", room: 0 } });
    run(m, 0.1);
    expect(me.weapons[slot].target).not.toBeNull();
    m.push(0, { c: "weaponPower", slot, on: false });
    run(m, 0.1);
    expect(me.weapons[slot].target).toBeNull();
    // Back on and aimed, then the weapons system is wrecked: the target goes with the power.
    m.push(0, { c: "weaponPower", slot, on: true });
    run(m, 0.1);
    m.push(0, { c: "target", slot, target: { kind: "room", room: 0 } });
    run(m, 0.1);
    me.systems.weapons!.damage = me.systems.weapons!.level;
    run(m, 0.1);
    expect(me.weapons[slot].powered).toBe(false);
    expect(me.weapons[slot].target).toBeNull();
  });
});
