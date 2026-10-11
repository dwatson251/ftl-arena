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

describe("playtest round 20: running out of missiles", () => {
  it("the last missile fired powers every missile gun down, with a NO MISSILES warning; they can't be powered again", () => {
    const tdb = placeholderDb();
    const launcher = Object.values(tdb.weapons).find((w) => w.missiles > 0);
    if (!launcher) return; // (the placeholder set has no missile weapon to test with)
    const lo = { ...baseLoadout(tdb, "PH_SKIFF"), weapons: [launcher.id], missiles: 1 };
    const m = new Match(tdb, DEFAULT_CONFIG, [lo, baseLoadout(tdb, "PH_SKIFF")], ["a", "b"]);
    const me = m.state.ships[0];
    m.push(0, { c: "weaponPower", slot: 0, on: true });
    m.push(0, { c: "target", slot: 0, target: { kind: "room", room: 0 } });
    m.push(0, { c: "autofire", slot: 0, on: true });
    let warned = false;
    for (let i = 0; i < 30 * 30 && me.missiles > 0; i++) {
      m.step();
      warned ||= m.state.events.some((e) => e.e === "noMissiles" && e.ship === 0);
    }
    expect(me.missiles).toBe(0);
    expect(me.weapons[0].powered).toBe(false);
    expect(me.weapons[0].target).toBeNull();
    expect(warned).toBe(true);
    m.push(0, { c: "weaponPower", slot: 0, on: true });
    m.step();
    expect(me.weapons[0].powered).toBe(false);
  });
});

describe("projectile speeds follow each weapon's FTL speed", () => {
  it("base time per type, scaled by the type's default speed over the weapon's own", async () => {
    const { existsSync } = await import("node:fs");
    const { loadDb } = await import("@ftl/extract");
    const { flightTime } = await import("@ftl/sim");
    // A weapon with no speed of its own flies at its type's base.
    expect(flightTime({ type: "LASER" })).toBe(1);
    expect(flightTime({ type: "MISSILES", speed: 0 })).toBe(1.5);
    expect(flightTime({ type: "BOMB", speed: 30 })).toBe(2.4);
    if (!existsSync("assets-local/manifest.json")) return;
    const db = loadDb("assets-local");
    const t = (id: string) => flightTime(db.weapons[id]);
    expect(t("LASER_BURST_1")).toBe(1);
    expect(t("LASER_HULL_1")).toBeCloseTo(0.8); // speed 75: sooner
    expect(t("ION_1")).toBeCloseTo(2); // speed 30: later
    expect(t("SHOTGUN")).toBeCloseTo(60 / 26); // flak, speed 26: about 2.3 s
    expect(t("MISSILES_1")).toBe(1.5);
  });
});

describe("charge weapons on autofire", () => {
  it("fire as soon as one charge is stored, not when full", () => {
    const tdb = placeholderDb();
    const charge = Object.values(tdb.weapons).find((w) => w.chargeLevels > 1 && w.missiles === 0) ?? { ...Object.values(tdb.weapons).find((w) => w.type === "LASER")!, id: "TEST_CHARGE", chargeLevels: 3 };
    tdb.weapons[charge.id] = { ...charge, missiles: 0, cooldown: 2 };
    const lo = { ...baseLoadout(tdb, "PH_SKIFF"), weapons: [charge.id] };
    const m = new Match(tdb, DEFAULT_CONFIG, [lo, baseLoadout(tdb, "PH_SKIFF")], ["a", "b"]);
    const me = m.state.ships[0];
    m.push(0, { c: "weaponPower", slot: 0, on: true });
    m.push(0, { c: "autofire", slot: 0, on: true });
    m.push(0, { c: "target", slot: 0, target: { kind: "room", room: 0 } });
    let fired = false;
    // One charge takes the cooldown (2 s) at worst; a full charge-up would take three times that.
    for (let i = 0; i < 30 * 3 && !fired; i++) {
      m.step();
      fired = me.stats.shotsFired > 0;
    }
    expect(fired).toBe(true);
  });
});
