import { describe, expect, it } from "vitest";
import { loadDb } from "@ftl/extract";
import { baseLoadout, DEFAULT_CONFIG, Match, priceLoadout } from "@ftl/sim";
import { Lobby, type Client } from "../apps/server/src/lobby.ts";

const db = loadDb();
const ship = db.hangar[0];

describe("Autonomous ships (a rules checkbox)", () => {
  it("lets a build launch with no crew, and only then", () => {
    const l = { ...baseLoadout(db, ship), crew: [] };
    expect(priceLoadout(db, l, 400).ok).toBe(false);
    expect(priceLoadout(db, l, 400, [], false, true).ok).toBe(true);
  });

  it("a crewless ship fights on: the match doesn't end for want of crew", () => {
    const empty = { ...baseLoadout(db, ship), crew: [] };
    const m = new Match(db, { ...DEFAULT_CONFIG, winCondition: "auto" }, [empty, baseLoadout(db, ship)], ["a", "b"]);
    for (let i = 0; i < 30 * 5; i++) m.step();
    expect(m.over).toBe(false);
  });

  it("the server prices builds by the checkbox, and keeps it out of Survival's battles", () => {
    const c: Client = { id: "H", name: "H", lobby: null, send: () => {} };
    const lob = new Lobby("AUTO", "H", db, {}, false);
    lob.join(c);
    expect(lob.setConfig(c, { winCondition: "auto" })).toBeNull();
    expect(lob.setLoadout(c, { ...baseLoadout(db, ship), crew: [] })).toBeNull();
    expect(lob.players[0].priced?.ok).toBe(true);
    lob.setConfig(c, { winCondition: "hull" });
    expect(lob.players[0].priced?.ok).toBe(false);
  });
});
