import { describe, expect, it } from "vitest";
import { DEFAULTS, resolveConfig } from "../apps/server/src/dedicated.ts";
import { startServer } from "../apps/server/src/server.ts";
import { WebSocket } from "ws";
import { PROTOCOL_VERSION } from "@ftl/protocol";

describe("dedicated server settings", () => {
  it("defaults, then the config file, then the environment, then arguments", () => {
    const none = resolveConfig([], {}, () => null);
    expect(none.cfg).toEqual(DEFAULTS);
    const file = JSON.stringify({ port: 9000, upnp: true, lan: false });
    const r = resolveConfig(["--port", "9100"], { FTL_ARENA_LAN: "1" }, () => file);
    expect(r.cfg).toMatchObject({ port: 9100, upnp: true, lan: true });
    expect(r.from).toMatchObject({ port: "argument", upnp: "config", lan: "env" });
    expect(resolveConfig([], {}, () => "{ nope").fileError).toMatch(/couldn't read/);
    expect(resolveConfig(["--port", "99999"], {}, () => null).cfg.port).toBe(8787);
  });
});

describe("a server with no FTL", () => {
  it("sends the game's data, without any of FTL's presentation", async () => {
    const s = await startServer({ port: 0, lan: false, log: () => {} });
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`);
    const welcome = await new Promise<any>((ok, bad) => {
      ws.on("open", () => ws.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name: "t" })));
      ws.on("message", (d) => {
        const m = JSON.parse(String(d));
        if (m.t === "welcome") ok(m);
      });
      ws.on("error", bad);
    });
    ws.close();
    await s.close();
    expect(welcome.db.hangar.length).toBe(28);
    expect(Object.keys(welcome.db.anims).length).toBe(0);
    expect(Object.keys(welcome.db.sounds).length).toBe(0);
    expect(welcome.db.source).toBe("placeholder");
  });
});
