/** Cloak/hack/ion visual check: Stealth (cloak) vs a Kruos bot (hacking). ARENA_URL; traces/cloakhack/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/cloakhack";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1600, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
type A = { view(): any; send(c: unknown): void; ui(): any; toScreen(x: number, y: number): { x: number; y: number } };
const arena = () => p.evaluate(() => 0);
void arena;
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(2500);
await p.selectOption('select[data-prac="botShip"]', "PLAYER_SHIP_ANAEROBIC");
await p.click('button[data-ship="PLAYER_SHIP_STEALTH"]');
await p.click('button[data-step="Launch"]');
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.waitForTimeout(1000);
await p.evaluate(() => {
  const a = (window as unknown as { __arena: A }).__arena;
  a.send({ c: "power", system: "medbay", delta: -1 });
  a.send({ c: "power", system: "cloaking", delta: 1 });
});
// Two ion hits on me (debug drawer), then watch the hack land.
await p.click('#debug [data-op="ion"][data-who="me"]');
await p.click('#debug [data-op="ion"][data-who="me"]');
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/01-ion.png` });
await p.waitForTimeout(6000);
await p.screenshot({ path: `${out}/02-hacked.png` });
const ui = await p.evaluate(() => (window as unknown as { __arena: A }).__arena.ui());
console.log("ui:", JSON.stringify(ui));
if (ui?.cloak) {
  const s = await p.evaluate(([x, y]) => (window as unknown as { __arena: A }).__arena.toScreen(x, y), [ui.cloak.x + 16, ui.cloak.y + 20]);
  await p.mouse.click(s.x, s.y);
}
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/03-cloaked.png` });
console.log(await p.evaluate(() => {
  const v = (window as unknown as { __arena: A }).__arena.view();
  return JSON.stringify(v.ships.map((s: any) => ({ cloak: s.cloak, hack: s.hack, evasion: s.evasion, locked: Object.values(s.systems).filter((x: any) => x.locked).map((x: any) => x.id), ion: Object.values(s.systems).filter((x: any) => x.ion).map((x: any) => `${x.id}:${x.ion}`) })));
}));
await browser.close();
