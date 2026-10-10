import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout } from "@ftl/sim";
import { Lobby, type Client } from "../apps/server/src/lobby.ts";

const db = placeholderDb();
const ship = db.hangar[0];
const client = (id: string): Client => ({ id, name: id, lobby: null, send: () => {} }) as unknown as Client;

describe("Bring your own ship (FTL saves only)", () => {
  it("switching it on clears the other captains' hangar builds (not the host's, not an FTL ship)", () => {
    const l = new Lobby("T", "A", db, {}, false);
    const a = client("A"), b = client("B");
    l.join(a);
    l.join(b);
    const built = { ...baseLoadout(db, ship), missiles: 9 };
    l.setLoadout(a, built);
    l.setLoadout(b, built);
    l.setReady(b, true);
    expect(l.setConfig(a, { ftlOnly: true })).toBeNull();
    const [pa, pb] = l.players;
    expect(pa.loadout?.missiles).toBe(9); // the host keeps theirs (they'll load a save before readying)
    expect(pb.loadout?.missiles).toBe(baseLoadout(db, ship).missiles);
    expect(pb.ready).toBe(false);
  });

  it("only a ship from an FTL save can ready, and the scrap allowance doesn't apply", () => {
    const l = new Lobby("T", "A", db, { scrap: 0, ftlOnly: true }, false);
    const a = client("A");
    l.join(a);
    const big = { ...baseLoadout(db, ship), missiles: 30 };
    l.setLoadout(a, big);
    expect(l.setReady(a, true)).toMatch(/FTL saves only/);
    l.setLoadout(a, { ...big, origin: "ftl" });
    expect(l.setReady(a, true)).toBeNull();
    expect(l.players[0].ready).toBe(true);
  });

  it("an FTL ship survives the switch for everyone", () => {
    const l = new Lobby("T", "A", db, {}, false);
    const a = client("A"), b = client("B");
    l.join(a);
    l.join(b);
    l.setLoadout(b, { ...baseLoadout(db, ship), missiles: 4, origin: "ftl" });
    l.setConfig(a, { ftlOnly: true });
    expect(l.players[1].loadout?.missiles).toBe(4);
  });
});
