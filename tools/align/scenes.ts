/**
 * Stage specific scenes in a practice match with the debug tools and screenshot each:
 * ion lock, hurt crew healing in the medbay, low health, breaches, hover tooltip, death.
 *   npx tsx tools/align/scenes.ts   (server + client running)
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
const out = "traces/scenes";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const p: Page = await (await browser.newContext({ viewport: { width: 1600, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto("http://localhost:5173");
await p.waitForSelector("#practice:not([disabled])");
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(2500);
await p.selectOption('select[data-prac="botShip"]', "REBEL_SKINNY");
await p.$eval('input[data-prac="difficulty"]', (el) => { (el as HTMLInputElement).value = "0"; el.dispatchEvent(new Event("change", { bubbles: true })); });
await p.waitForTimeout(300);
// Walk the steps with the summary button (Ready only appears on the last step).
for (let i = 0; i < 4; i++) {
  await p.click(".hg-summary button.big");
  await p.waitForTimeout(250);
}
await p.screenshot({ path: `${out}/01-launch-step.png` });
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/02-ready-warning.png` });
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.waitForTimeout(1500);
const to = async (x: number, y: number) => p.evaluate(([a, b]) => (window as unknown as { __arena: { toScreen(x: number, y: number): { x: number; y: number } } }).__arena.toScreen(a, b), [x, y]);
const dbg = (op: string, who: string) => p.click(`#debug button[data-op="${op}"][data-who="${who}"]`);
await dbg("ion", "me");
await dbg("hurt", "me");
// Power the medbay: take a bar from the engines (2nd icon), give it to the medbay (3rd).
const eng = await to(58 + 36 + 32, 683);
await p.mouse.click(eng.x, eng.y, { button: "right" });
await p.waitForTimeout(150);
const medb = await to(58 + 72 + 32, 683);
await p.mouse.click(medb.x, medb.y);
await p.waitForTimeout(150);
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/03-ion-hurt.png` });
// Send all crew to the medbay: Tab selects all; the Kestrel medbay is room 4.
await p.keyboard.press("Tab");
const med = await p.evaluate(() => 0);
void med;
const m = await to(510, 330);
await p.mouse.click(m.x, m.y, { button: "right" });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/04-medbay-healing.png` });
console.log(await p.evaluate(() => {
  const v = (window as unknown as { __arena: { view(): any } }).__arena.view();
  const s = v.ships[v.you];
  return JSON.stringify({ med: s.systems.medbay, eng: s.systems.engines?.power, crew: s.crew.map((c: any) => [c.tile, c.task, Math.round(c.hp), c.path.length]) });
}));
// Hover a crew member in the list.
const c = await to(50, 168);
await p.mouse.move(c.x, c.y);
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/05-tooltip.png` });
// Breach + fire on the enemy, then watch.
await dbg("fire", "them");
await p.click('#debug button[data-speed="2"]');
await p.waitForTimeout(6000);
await p.screenshot({ path: `${out}/06-later.png` });
await p.click('#debug button[data-speed="1"]');
for (let i = 0; i < 3; i++) await dbg("hurt", "me");
for (let i = 0; i < 4; i++) {
  await p.waitForTimeout(220);
  await p.screenshot({ path: `${out}/07-dying-${i}.png` });
}
await browser.close();
