/** Repair progress on the system bars, frame by frame (traces/repairbars/): breaks a system (debug) and
 *  captures the bars while the crew mend it.  Usage: ARENA_URL=<vite dev> npx tsx tools/align/repairbars.ts */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
mkdirSync("traces/repairbars", { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })).newPage();
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(400);
await p.click('button[data-step="Launch"]');
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(1500);
for (let i = 0; i < 3; i++) await p.click('#debug [data-op="damage"][data-who="me"]');
await p.click("#debug [data-toggle]").catch(() => {});
await p.waitForTimeout(500);
for (let i = 0; i < 8; i++) {
  await p.screenshot({ path: `traces/repairbars/${i}.png`, clip: { x: 60, y: 600, width: 220, height: 100 } });
  await p.waitForTimeout(700);
}
await b.close();
