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
});
