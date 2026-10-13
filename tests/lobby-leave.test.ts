import { describe, expect, it } from "vitest";
import { loadDb } from "@ftl/extract";
import { Lobby, type Client } from "../apps/server/src/lobby.ts";

const db = loadDb();
const client = (id: string): Client & { got: any[] } => {
  const c: any = { id, name: id, lobby: null, got: [] };
  c.send = (m: any) => c.got.push(m);
  return c;
};
const lobby = () => new Lobby("TEST", "A", db, {}, false);

describe("captains leaving", () => {
  it("in the hangar: the friend becomes host and the old host can come back", () => {
    const l = lobby();
    const a = client("A"), b = client("B");
    l.join(a);
    l.join(b);
    l.leave(a, true);
    expect(l.host).toBe("B");
    expect(l.players.map((p) => p.id)).toEqual(["B"]);
    expect(l.join(a)).toBeNull();
    expect(l.players.map((p) => p.id)).toEqual(["B", "A"]);
  });

  it("after a battle: the seat frees up and someone new can join (back in the hangar)", () => {
    const l = lobby();
    const a = client("A"), b = client("B");
    l.join(a);
    l.join(b);
    l.phase = "over";
    l.leave(a, true);
    expect(l.host).toBe("B");
    expect(l.players.length).toBe(1);
    const c = client("C");
    expect(l.join(c)).toBeNull();
    expect(l.phase).toBe("lobby");
    expect(l.players.map((p) => p.id)).toEqual(["B", "C"]);
  });

  it("mid-battle Leave: forfeits, frees the seat, and the friend is host", () => {
    const l = lobby();
    const a = client("A"), b = client("B");
    l.join(a);
    l.join(b);
    (l as any).start();
    expect(l.phase).toBe("battle");
    l.leave(a, true);
    expect(l.phase).toBe("over");
    expect(l.host).toBe("B");
    expect(l.seated("A")).toBe(false);
  });

  it("a dropped connection keeps the seat", () => {
    const l = lobby();
    const a = client("A"), b = client("B");
    l.join(a);
    l.join(b);
    l.phase = "battle";
    l.leave(a, false);
    expect(l.seated("A")).toBe(true);
  });

  it("the host's app closing mid-battle: the host forfeits and the friend is told they won", () => {
    const l = lobby();
    const a = client("A"), b = client("B");
    a.local = true;
    l.join(a);
    l.join(b);
    (l as any).start();
    b.got.length = 0;
    l.shutdown();
    expect(l.phase).toBe("over");
    const snap = b.got.find((m) => m.t === "snap" && m.view.winner !== null);
    expect(snap.view.winner).toBe(snap.view.you);
    expect(snap.view.endReason).toMatch(/A closed the game/);
    expect(snap.view.events.some((e: any) => e.e === "end")).toBe(true);
  });

  it("a dedicated server shutting down mid-battle: a draw, nobody blamed", () => {
    const l = lobby();
    const a = client("A"), b = client("B");
    l.join(a);
    l.join(b);
    (l as any).start();
    l.shutdown();
    expect(b.got.at(-1)).toBeTruthy();
    const snap = b.got.filter((m) => m.t === "snap").at(-1);
    expect(snap.view.winner).toBe(-1);
  });
});
