import { describe, expect, it } from "vitest";
import { placeholderDb } from "@ftl/data";
import { baseLoadout, DEFAULT_CONFIG, Match, RULES, TICK_HZ, type MatchConfig } from "@ftl/sim";

const db = placeholderDb();
const lo = () => baseLoadout(db, "PH_SKIFF");
const match = (cfg: Partial<MatchConfig>) => new Match(db, { ...DEFAULT_CONFIG, ...cfg }, [lo(), lo()], ["a", "b"]);
const run = (m: Match, secs: number) => {
  for (let i = 0; i < secs * TICK_HZ; i++) m.step();
};

describe("tactical timeouts", () => {
  it("warn ahead, freeze time for their length, take orders meanwhile, and end early once both are ready", () => {
    const m = match({ pause: "tactical", tacticalEvery: 20, tacticalLength: 8 });
    let warned = false;
    for (let i = 0; i < 20 * TICK_HZ; i++) {
      m.step();
      if (m.state.events.some((e) => e.e === "pauseWarn")) warned = true;
    }
    expect(warned).toBe(true);
    m.step();
    expect(m.state.pause?.kind).toBe("tactical");
    const tick = m.state.tick;
    const s = m.state.ships[0];
    const c = s.crew[0];
    const [x, y] = [c.x, c.y];
    // An order given while paused is taken (a path) but nobody moves until time runs again.
    const room = m.geo(s).tiles.get(s.crew[1].tile)!.room;
    m.push(0, { c: "moveCrew", crew: [c.id], room });
    run(m, 3);
    expect(m.state.tick).toBe(tick);
    expect([c.x, c.y]).toEqual([x, y]);
    expect(c.path.length).toBeGreaterThan(0);
    m.push(0, { c: "pause", on: false });
    m.step();
    expect(m.state.pause).toBeTruthy();
    m.push(1, { c: "pause", on: false });
    m.step();
    expect(m.state.pause).toBeFalsy();
    run(m, 1);
    expect(m.state.tick).toBeGreaterThan(tick);
  });
  it("end by themselves when their time runs out, then come round again", () => {
    const m = match({ pause: "tactical", tacticalEvery: 15, tacticalLength: 5 });
    run(m, 15.1);
    expect(m.state.pause?.kind).toBe("tactical");
    run(m, 5.1);
    expect(m.state.pause).toBeFalsy();
    run(m, 15.1);
    expect(m.state.pause?.kind).toBe("tactical");
  });
});

describe("pause clock", () => {
  it("pauses everyone from the pauser's own bank, resumes when they say or when it's empty, and regains slowly", () => {
    const m = match({ pause: "clock", pauseBank: 6, pauseRegen: 30 });
    m.push(0, { c: "pause", on: true });
    m.step();
    expect(m.state.pause?.by).toBe(0);
    // The other player can't pause on top, or resume someone else's pause.
    m.push(1, { c: "pause", on: false });
    m.push(1, { c: "pause", on: true });
    run(m, 2);
    expect(m.state.pause?.by).toBe(0);
    expect(m.state.pauseBank![0]).toBeCloseTo(4, 0);
    expect(m.state.pauseBank![1]).toBe(6);
    m.push(0, { c: "pause", on: false });
    m.step();
    expect(m.state.pause).toBeFalsy();
    // 30 s a minute back: 2 s used come back in ~4 s.
    run(m, 4.2);
    expect(m.state.pauseBank![0]).toBeCloseTo(6, 1);
    // Run the bank dry: the match resumes on its own.
    m.push(1, { c: "pause", on: true });
    run(m, 7);
    expect(m.state.pause).toBeFalsy();
    expect(m.state.pauseBank![1]).toBeLessThan(1);
  });
  it("is unlimited with a zero bank (practice), and does nothing when pausing is off", () => {
    const m = match({ pause: "clock", pauseBank: 0 });
    m.push(0, { c: "pause", on: true });
    run(m, 30);
    expect(m.state.pause?.by).toBe(0);
    expect(m.state.pauseBank![0]).toBe(-1);
    const off = match({});
    off.push(0, { c: "pause", on: true });
    off.step();
    expect(off.state.pause).toBeFalsy();
    expect(RULES.pauseBank).toBeGreaterThan(0);
  });
});
