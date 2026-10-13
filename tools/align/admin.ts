/** The dedicated server's admin page with a lobby open (traces/admin/). Usage: ADMIN=localhost:8795 npx tsx tools/align/admin.ts */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import { PROTOCOL_VERSION } from "@ftl/protocol";
const HOST = process.env.ADMIN ?? "localhost:8795";
mkdirSync("traces/admin", { recursive: true });
const ws = new WebSocket(`ws://${HOST}/ws`);
await new Promise<void>((ok) => {
  ws.on("open", () => ws.send(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name: "Ann" })));
  ws.on("message", (d) => {
    const m = JSON.parse(String(d));
    if (m.t === "welcome") ws.send(JSON.stringify({ t: "create", config: { mods: ["noDrones"] } }));
    if (m.t === "lobby" && m.lobby) ok();
  });
});
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
await p.goto(`http://${HOST}/admin`);
await p.waitForTimeout(2500);
console.log("stats:", await p.$eval("#stats", (e) => e.textContent));
await p.screenshot({ path: "traces/admin/page.png" });
await b.close();
ws.close();
