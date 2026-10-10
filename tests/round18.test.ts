import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match, RULES, viewFor } from "@ftl/sim";

const run = (m: Match, s: number) => {
  for (let i = 0; i < Math.round(s * 30); i++) m.step();
};

describe("playtest round 18", () => {
  it("only a working medbay heals (and flags who it heals, for the crosses and sound)", () => {
    const db = placeholderDb();
    const b = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const me = m.state.ships[0];
    const med = me.systems.medbay!;
    const g = m.geo(me);
    const c = me.crew[0];
    const tile = g.roomTiles.get(med.room)![0];
    c.tile = tile;
    c.home = tile;
    c.path = [];
    [c.x, c.y] = tile.split(",").map(Number);
    c.hp = 50;
    run(m, 0.5);
    expect(c.healing).toBe(true);
    expect(c.hp).toBeGreaterThan(50);
    // Wrecked: no healing, no crosses.
    med.damage = med.level;
    c.hp = 50;
    run(m, 0.5);
    expect(c.healing).toBe(false);
    expect(c.hp).toBeLessThanOrEqual(50);
  });

  it("the enemy's guns show powered or not whatever your sensors (they slide in and out on the hull)", () => {
    const db = placeholderDb();
    const b = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const them = m.state.ships[1];
    if (!them.weapons[0]) return;
    them.weapons[0].powered = true;
    const v = viewFor(m, 0);
    const ew = v.ships[1].weapons[0];
    if (!v.ships[1].weaponChargeKnown) expect(ew.charge).toBe(-1);
    expect(ew.powered).toBe(true);
  });

  it("their shield recharge bar is hidden unless your hacking drone sits on their shields", () => {
    const db = placeholderDb();
    const b = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [b, b], ["a", "b"]);
    const [me, them] = m.state.ships;
    them.shieldCharge = 0.5;
    expect(viewFor(m, 0).ships[1].shieldCharge).toBe(0);
    me.hack = { room: them.systems.shields!.room, attached: true, pulse: 0, cd: 0 };
    const v = viewFor(m, 0).ships[1];
    expect(v.shieldChargeKnown).toBe(true);
    expect(v.shieldCharge).toBe(0.5);
  });

  it("the Shield Overcharger holds still while it charges, keeping the wiki's timing", () => {
    const db = placeholderDb();
    const ship = db.ships.PH_SKIFF;
    ship.droneSlots = 1;
    ship.systems.push({ id: "drones", room: 9, power: 3, start: true, station: -1 });
    db.systems.drones = { id: "drones", maxPower: 8, startPower: 2, upgradeCost: [30, 40, 50, 60, 70, 80, 90], cost: 60 };
    db.droneBPs = { DRONE_SHIELD: { id: "DRONE_SHIELD", title: "Shield Overcharger", type: "SHIELD", power: 3, cost: 60, cooldown: 2, speed: 5, weapon: "", image: "", icon: "", rarity: 1 } };
    const b = baseLoadout(db, "PH_SKIFF");
    const m = new Match(db, DEFAULT_CONFIG, [{ ...b, drones: ["DRONE_SHIELD"], droneParts: 2, reactor: 20 }, b], ["a", "b"]);
    const me = m.state.ships[0];
    m.apply(me, { c: "dronePower", slot: 0, on: true });
    run(m, RULES.droneLaunch + RULES.shieldDroneTimes[0] - RULES.shieldDroneCharge - 0.5);
    const d = me.drones![0];
    const a0 = d.angle;
    run(m, 0.3);
    expect(d.angle).toBeGreaterThan(a0); // still orbiting
    run(m, 0.5);
    const a1 = d.angle;
    run(m, 0.5);
    expect(d.angle).toBe(a1); // holding still mid-charge
    run(m, 0.6);
    expect(me.superShield).toBe(1);
    const a2 = d.angle;
    run(m, 0.3);
    expect(d.angle).toBeGreaterThan(a2); // off again
  });
});
