/** Each listed hull in the hangar's preview and as the enemy in battle (traces/hulls/). SHIPS=id,id,...
 *  Usage: ARENA_URL=... npx tsx tools/align/hulls.ts */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const ships = (process.env.SHIPS ?? "PLAYER_SHIP_HARD,PLAYER_SHIP_HARD_2,PLAYER_SHIP_HARD_3,PLAYER_SHIP_ROCK,PLAYER_SHIP_ROCK_2,PLAYER_SHIP_ROCK_3").split(",");
mkdirSync("traces/hulls", { recursive: true });
const b = await chromium.launch();
for (const id of ships) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
  await p.goto(URL);
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  await p.click('[data-open="single"]');
  await p.waitForSelector(".hg-step");
  await p.waitForTimeout(500);
  // The bot flies this hull too, so it shows in the target window.
  await p.selectOption('select[data-prac="botShip"]', id).catch(() => {});
  await p.click('button[data-step="Ship"]');
  await p.click(`button[data-ship="${id}"]`);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `traces/hulls/${id}-hangar.png` });
  await p.click('button[data-step="Launch"]');
  await p.click('button[data-ready="1"]');
  const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
  if (force) await force.click();
  await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
  await p.click("#debug [data-toggle]").catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `traces/hulls/${id}-battle.png` });
  await p.close();
}
await b.close();
