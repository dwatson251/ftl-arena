/** A ship going up shows only its exterior (no floor art or rooms) before it breaks apart (traces/dying/).
 *  SHIP=<hull the bot flies>.  Usage: ARENA_URL=<vite dev> npx tsx tools/align/dying.ts */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const ship = process.env.SHIP ?? "PLAYER_SHIP_HARD";
mkdirSync("traces/dying", { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(500);
await p.selectOption('select[data-prac="botShip"]', ship);
await p.waitForTimeout(400);
await p.click('button[data-step="Launch"]');
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(1500);
await p.evaluate(() => { for (let i = 0; i < 20; i++) document.querySelector<HTMLButtonElement>('#debug [data-op="hull"][data-who="them"][data-delta="-5"]')?.click(); });
await p.click("#debug [data-toggle]").catch(() => {});
const t0 = Date.now();
for (let i = 0; Date.now() - t0 < 3000; i++) await p.screenshot({ path: `traces/dying/${String(i).padStart(2, "0")}.png`, clip: { x: 880, y: 55, width: 380, height: 530 } });
await b.close();
