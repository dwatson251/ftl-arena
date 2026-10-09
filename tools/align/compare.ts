/**
 * Screenshot the arena's battle screen at 1280×720 (debug drawer collapsed) next to a real FTL
 * screenshot, for UI alignment. Needs server + client running.
 *   npx tsx tools/align/compare.ts [real.jpg] [--enemy MANTIS_SCOUT]
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const args = process.argv.slice(2);
const get = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const out = "traces/align";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto("http://localhost:5173");
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(1500);
await p.selectOption('select[data-prac="botShip"]', get("--enemy", "MANTIS_SCOUT"));
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/hangar-ship.png` });
await p.click('button[data-step="Weapons"]');
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/hangar-weapons.png` });
await p.click('button[data-step="Crew"]');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/hangar-crew.png` });
await p.click('button[data-step="Launch"]');
await p.waitForTimeout(200);
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.waitForTimeout(800);
await p.click("#debug button[data-toggle]");
await p.waitForTimeout(400);
await p.evaluate(() => document.getElementById("debug")?.style.setProperty("display", "none"));
await p.waitForTimeout(Number(get("--wait", "3500")));
await p.screenshot({ path: `${out}/arena.png` });
if (args.includes("--burst")) {
  // Power + target both weapons (slot boxes at 251+97i, 623), autofire on, then grab frames.
  for (const i of [0, 1]) {
    await p.keyboard.press("Escape");
    await p.mouse.click(251 + i * 97 + 47, 640);
    await p.waitForTimeout(100);
    await p.mouse.click(251 + i * 97 + 47, 640);
    await p.waitForTimeout(100);
    await p.mouse.click(1070, 330);
    await p.waitForTimeout(100);
  }
  await p.mouse.click(586, 682);
  for (let i = 0; i < 40; i++) {
    await p.screenshot({ path: `${out}/burst-${String(i).padStart(2, "0")}.png` });
    await p.waitForTimeout(120);
  }
}
await browser.close();
