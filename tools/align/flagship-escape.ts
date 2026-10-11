/**
 * The flagship's stage end (pieces break off, the rest escapes with the bottom-to-top fade and a tail flare),
 * plus the hazard icon and the "imminent" warning.  Usage: ARENA_URL=... npx tsx tools/align/flagship-escape.ts
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/flagship-escape";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(500);
await p.selectOption('select[data-prac="botShip"]', "BOSS_1");
await p.waitForTimeout(300);
await p.selectOption('select[data-cfg="hazard"]', "sun");
await p.waitForTimeout(400);
await p.locator(".hg-step", { hasText: "Launch" }).click();
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
// Wait for a flare warning (the red giant fires every so often).
for (let i = 0; i < 60; i++) {
  await p.waitForTimeout(500);
  const hz = await p.evaluate(() => (window as any).__arena.view()?.hazard);
  if (hz && hz.next <= 4) break;
}
await p.screenshot({ path: `${out}/1-hazard-warning.png` });
await p.evaluate(() => { const el = document.querySelector<HTMLButtonElement>('#debug [data-op="hull"][data-who="them"][data-delta="-5"]'); for (let i = 0; i < 14; i++) el?.click(); });
const t0 = Date.now();
for (let i = 0; Date.now() - t0 < 5500; i++) await p.screenshot({ path: `${out}/2-escape${String(i).padStart(2, "0")}-${Date.now() - t0}ms.jpg`, type: "jpeg", quality: 60, clip: { x: 640, y: 120, width: 310, height: 410 } });
// After the escape the hostiles window clears; the hazard icon moves to the screen's right edge.
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/3-cleared.png` });
await b.close();
