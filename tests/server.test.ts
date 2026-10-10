import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { startServer } from "../apps/server/src/server.ts";

describe("server as a library", () => {
  it("starts on a free port, serves the assets folder and closes cleanly", async () => {
    const assets = existsSync("assets-local/manifest.json") ? "assets-local" : "tests";
    const s = await startServer({ port: 0, assets, host: "127.0.0.1", log: () => {} });
    expect(s.port).toBeGreaterThan(0);
    const r = await fetch(`http://127.0.0.1:${s.port}/assets/${assets === "assets-local" ? "manifest.json" : "server.test.ts"}`);
    expect(r.status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${s.port}/assets/nope.png`)).status).toBe(404);
    await s.close();
  });

  it("closes promptly with open keep-alive and WebSocket connections, freeing the port", async () => {
    const { Agent, get } = await import("node:http");
    const { default: WebSocket } = await import("ws");
    const assets = existsSync("assets-local/manifest.json") ? "assets-local" : "tests";
    const s = await startServer({ port: 0, assets, host: "127.0.0.1", lan: false, log: () => {} });
    const agent = new Agent({ keepAlive: true });
    await new Promise<void>((ok) => get({ host: "127.0.0.1", port: s.port, path: "/assets/nope.png", agent }, (r) => { r.resume(); r.on("end", () => ok()); }));
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`);
    await new Promise((ok) => ws.on("open", ok));
    const t0 = Date.now();
    await s.close();
    expect(Date.now() - t0).toBeLessThan(1500);
    // The same port binds again straight away.
    const again = await startServer({ port: s.port, assets, host: "127.0.0.1", lan: false, log: () => {} });
    expect(again.port).toBe(s.port);
    await again.close();
    agent.destroy();
  });
});
