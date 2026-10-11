/**
 * The host's game closes mid-battle: the friend (on another machine) is told they won by forfeit.
 *   clean: the server shuts down properly (the app's quit), and says so first.
 *   crash: the server just vanishes; the friend's client waits a few seconds, then calls it.
 * Usage: npx tsx tools/align/forfeit.ts <lan-ip> [clean|crash]
 */
import { chromium, type Page } from "playwright";
import { resolve } from "node:path";
import { startServer } from "../../apps/server/src/server.ts";
const lan = process.argv[2] ?? "192.168.1.16";
const how = process.argv[3] ?? "clean";
import { spawn } from "node:child_process";
// clean: the server runs here and is closed properly; crash: it runs in a child process that gets SIGKILLed.
const s = how === "clean" ? await startServer({ port: 8792, assets: "assets-local", client: resolve("apps/client/dist"), lan: false, log: () => {} }) : null;
const child = how === "crash" ? spawn("npx", ["tsx", "apps/server/src/main.ts", "--port", "8792"], { stdio: "ignore", detached: true }) : null;
if (child) await new Promise((r) => setTimeout(r, 5000));
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
let armed = false;
const page = async (name: string, host: string) => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  if (name === "Friend") {
    p.on("websocket", (ws) => {
      ws.on("framereceived", (f) => {
        const t = String(f.payload);
        if (armed) console.log("frame:", t.slice(0, 16), t.match(/"winner":(-?\d+|null),"endReason":"[^"]*"/)?.[0]);
      });
      ws.on("close", () => console.log("ws closed", ws.url()));
    });
    p.on("console", (m) => armed && console.log("console:", m.text().slice(0, 160)));
  }
  p.setDefaultTimeout(20000);
  p.on("pageerror", (e) => console.log(name, "pageerror:", e.message));
  await p.goto(`http://${host}:8792/`);
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  await p.click('[data-mode="online"]');
  await p.fill("#name", name);
  await p.fill("#server", `${host}:8792`);
  return p;
};
const ready = async (p: Page) => {
  await p.locator(".hg-step", { hasText: "Launch" }).click();
  await p.click('button[data-ready="1"]');
  const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
  if (force) await force.click();
};
const host = await page("Host", "127.0.0.1");
const friend = await page("Friend", lan);

await host.click("#create");
await host.waitForSelector(".hg-step");
const code = (await host.$eval(".code", (e) => e.textContent ?? "")).trim();
await friend.fill("#code", code);
await friend.click("#join");
await friend.waitForSelector(".hg-step");
await ready(host);
await ready(friend);
await friend.waitForTimeout(1500);
await host.screenshot({ path: "traces/forfeit/0-host.png" });
await friend.screenshot({ path: "traces/forfeit/0-friend.png" });
await friend.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await friend.waitForTimeout(3000);
console.log("battle on; closing the host's server:", how);
armed = true;
if (s) await s.close();
else process.kill(-child!.pid!, "SIGKILL"); // the whole process group: npx, tsx and node
for (let i = 0; i < 24; i++) {
  await friend.waitForTimeout(500);
  const t = await friend.$$eval(".toast, .overlay h1, .overlay p", (es) => es.map((e) => e.textContent?.trim()).join(" | "));
  if (t) console.log(`${(i + 1) * 0.5}s:`, t);
  if (await friend.$(".overlay h1")) break;
  if (i === 5) console.log("state:", await friend.evaluate(() => document.getElementById("ui")?.innerHTML.slice(0, 300)));
}
await friend.waitForTimeout(500);
await friend.screenshot({ path: `traces/forfeit/${how}.png` });
await b.close();
process.exit(0);
