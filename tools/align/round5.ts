/** Round-5 visual checks (server + client running; URL via ARENA_URL). Screenshots in traces/round5/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/round5";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1600, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(2500);
await p.click('button[data-ship="PLAYER_SHIP_MANTIS"]');
await p.click('button[data-step="Systems"]');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/01-systems.png` });
await p.click('button[data-step="Weapons"]');
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/02-weapons.png` });
await p.click('button[data-step="Augments"]');
await p.waitForTimeout(300);
await p.click('button[data-aug="AUTO_COOLDOWN"]').catch(() => console.log("no AUTO_COOLDOWN"));
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/03-augments.png` });
await p.click('button[data-step="Launch"]');
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/04-battle.png` });
const to = async (x: number, y: number) => p.evaluate(([a, b]) => (window as unknown as { __arena: { toScreen(x: number, y: number): { x: number; y: number } } }).__arena.toScreen(a, b), [x, y]);
// Power + target each weapon with autofire, then capture a run of frames.
for (let i = 0; i < 2; i++) {
  const w = await to(251 + i * 97 + 47, 640);
  await p.keyboard.press("Escape");
  await p.mouse.click(w.x, w.y);
  await p.waitForTimeout(150);
  await p.mouse.click(w.x, w.y);
  await p.waitForTimeout(150);
  const e = await to(1070, 330);
  await p.keyboard.down("Shift");
  await p.mouse.click(e.x, e.y);
  await p.keyboard.up("Shift");
  await p.waitForTimeout(150);
}
await p.waitForTimeout(9000);
for (let i = 0; i < 24; i++) {
  await p.screenshot({ path: `${out}/burst-${String(i).padStart(2, "0")}.png` });
  await p.waitForTimeout(70);
}
await p.click('#debug button[data-op="breach"][data-who="me"]');
await p.click('#debug button[data-op="hull"][data-who="them"][data-delta="-5"]');
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/05-debug.png` });
await browser.close();
