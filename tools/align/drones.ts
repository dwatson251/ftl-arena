/** Drone visual check: Engi Torus (combat drone) vs an Engi bot. ARENA_URL, screenshots in traces/drones/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/drones";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1600, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(2500);
await p.selectOption('select[data-prac="botShip"]', "PLAYER_SHIP_CIRCLE");
await p.click('button[data-ship="PLAYER_SHIP_CIRCLE"]');
await p.click('button[data-step="Drones"]');
await p.click(`button[data-drone="DEFENSE_1"]`).catch(() => {});
await p.evaluate(() => document.querySelector(".race-grid")?.scrollIntoView());
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/01-drones-step.png` });
await p.click('button[data-step="Launch"]');
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.waitForTimeout(1500);
const to = async (x: number, y: number) => p.evaluate(([a, b]) => (window as unknown as { __arena: { toScreen(x: number, y: number): { x: number; y: number } } }).__arena.toScreen(a, b), [x, y]);
for (const i of [0, 1]) {
  const b = await to(660 + 17 + i * 97 + 47, 640);
  await p.mouse.click(b.x, b.y);
  await p.waitForTimeout(200);
}
await p.waitForTimeout(14000);
await p.screenshot({ path: `${out}/02-battle.png` });
console.log(await p.evaluate(() => {
  const v = (window as unknown as { __arena: { view(): any } }).__arena.view();
  return JSON.stringify(v.ships.map((s: any) => ({ parts: s.droneParts, drones: s.drones, dsys: s.systems.drones?.power })));
}));
await browser.close();
