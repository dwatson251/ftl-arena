import { describe, expect, it } from "vitest";
import { cleanConfig, DEFAULTS, resolveConfig } from "../apps/server/src/config.ts";
import { startServer } from "../apps/server/src/server.ts";
import { authorised } from "../apps/server/src/admin.ts";
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

describe("admin API", () => {
  it("status, lobbies and logs from this machine; settings through the host's hooks; closing a lobby", async () => {
    let saved: unknown = null;
    const s = await startServer({
      port: 0, lan: false, log: () => {},
      admin: { token: () => "", getConfig: () => ({ port: 1, adminToken: "" }), setConfig: (c) => ((saved = c), { ok: true, restart: true }) },
    });
    const base = `http://127.0.0.1:${s.port}`;
    // A player makes a lobby.
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`);
    await new Promise<void>((ok) => {
      ws.on("open", () => ws.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name: "Ann" })));
      ws.on("message", (d) => {
        const m = JSON.parse(String(d));
        if (m.t === "welcome") ws.send(JSON.stringify({ t: "create", config: {} }));
        if (m.t === "lobby" && m.lobby) ok();
      });
    });
    const status = await (await fetch(`${base}/api/admin/status`)).json();
    expect(status).toMatchObject({ lobbies: 1, players: 1, online: 1 });
    const lobbies = await (await fetch(`${base}/api/admin/lobbies`)).json();
    expect(lobbies[0].players[0]).toMatchObject({ name: "Ann", connected: true });
    const logs = await (await fetch(`${base}/api/admin/logs?since=-1`)).json();
    expect(logs.lines.some((l: { text: string }) => /created a match/.test(l.text))).toBe(true);
    expect(await (await fetch(`${base}/api/admin/config`)).json()).toEqual({ port: 1, adminToken: "" });
    const put = await (await fetch(`${base}/api/admin/config`, { method: "PUT", body: JSON.stringify({ port: 2 }) })).json();
    expect(put).toEqual({ ok: true, restart: true });
    expect(saved).toEqual({ port: 2 });
    expect((await fetch(`${base}/api/admin/close?code=${lobbies[0].code}`, { method: "POST" })).status).toBe(200);
    expect((await (await fetch(`${base}/api/admin/status`)).json()).lobbies).toBe(0);
    expect((await fetch(`${base}/admin`)).headers.get("content-type")).toMatch(/html/);
    ws.close();
    await s.close();
  });

  it("settings from a file are checked key by key", () => {
    expect(cleanConfig({ port: "9000", upnp: 1, junk: 3 } as never).cfg).toEqual({ port: 9000, upnp: true });
    expect(cleanConfig({ port: 70000 }).error).toMatch(/port/);
  });
});

describe("admin access", () => {
  const req = (addr: string, auth = "") => ({ socket: { remoteAddress: addr }, headers: { authorization: auth } }) as never;
  it("this machine always; others only with the token (and never when there's none)", () => {
    const none = { token: () => "" };
    const set = { token: () => "s3cret" };
    expect(authorised(req("127.0.0.1"), new URLSearchParams(), none)).toBe(true);
    expect(authorised(req("192.168.1.5"), new URLSearchParams(), none)).toBe(false);
    expect(authorised(req("192.168.1.5"), new URLSearchParams(), set)).toBe(false);
    expect(authorised(req("192.168.1.5", "Bearer s3cret"), new URLSearchParams(), set)).toBe(true);
    expect(authorised(req("192.168.1.5"), new URLSearchParams("token=s3cret"), set)).toBe(true);
    expect(authorised(req("192.168.1.5", "Bearer nope"), new URLSearchParams(), set)).toBe(false);
  });
});
