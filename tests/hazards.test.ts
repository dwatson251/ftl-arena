import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match, RULES, TICK_HZ, viewFor, type MatchConfig } from "@ftl/sim";

const db = placeholderDb();
const lo = () => baseLoadout(db, "PH_SKIFF");
const match = (cfg: Partial<MatchConfig>) => new Match(db, { ...DEFAULT_CONFIG, ...cfg }, [lo(), lo()], ["a", "b"]);
const run = (m: Match, secs: number) => {
  const ev: string[] = [];
  for (let i = 0; i < secs * TICK_HZ; i++) {
    m.step();
    for (const e of m.state.events) if (e.e === "hazard") ev.push(e.kind);
  }
  return ev;
};

describe("hazards", () => {
  it("a red giant warns, then flares both ships, starting fires", () => {
    const m = match({ hazard: "sun" });
    const ev = run(m, RULES.flareEvery[1] + 0.5);
    expect(ev).toContain("warn");
    expect(ev.filter((k) => k === "flare").length).toBe(2);
    expect(m.state.ships.every((s) => s.rooms.some((r) => Object.keys(r.fires).length) || s.hull < s.maxHull)).toBe(true);
  });
  it("a pulsar ionises systems on both ships", () => {
    const m = match({ hazard: "pulsar" });
    run(m, RULES.pulsarEvery[1] + 0.2);
    for (const s of m.state.ships) expect(Object.values(s.systems).some((x) => x && x.ion > 0)).toBe(true);
  });
  it("asteroids fly at both ships", () => {
    const m = match({ hazard: "asteroids" });
    const seen = new Set<number>();
    for (let i = 0; i < 60 * TICK_HZ; i++) {
      m.step();
      for (const p of m.state.projectiles) if (p.weapon === "__ASTEROID") seen.add(1 - p.from);
    }
    expect(seen.size).toBe(2);
  });
  it("a nebula blinds sensors; an ion storm also halves the reactor", () => {
    const m = match({ hazard: "storm" });
    m.step();
    expect(viewFor(m, 0).ships[1].interior).toBe(false);
    expect(m.cap(m.state.ships[0])).toBe(Math.ceil(m.state.ships[0].reactor / 2));
  });
  it("the anti-ship batteries take turns at each ship", () => {
    const m = match({ hazard: "asb" });
    const targets: number[] = [];
    for (let i = 0; i < (RULES.asbEvery[1] * 2 + 1) * TICK_HZ; i++) {
      m.step();
      for (const e of m.state.events) if (e.e === "hazard" && e.kind === "asb") targets.push(e.ship!);
    }
    expect(new Set(targets).size).toBe(2);
  });
});
