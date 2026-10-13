/** Final-systems visual check. ARENA_URL; traces/final/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/final";
mkdirSync(out, { recursive: true });
type A = { view(): any; send(c: unknown): void };
const browser = await chromium.launch();
async function run(name: string, me: string, bot: string, wait: number, setup?: string) {
  const p = await (await browser.newContext({ viewport: { width: 1600, height: 720 } })).newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
  await p.goto(URL);
  await p.waitForSelector("#practice:not([disabled])");
  await p.click('[data-open="single"]');
  await p.waitForSelector(".hg-step");
  await p.waitForTimeout(2500);
  await p.selectOption('select[data-prac="botShip"]', bot);
  await p.click(`button[data-ship="${me}"]`);
  await p.click('button[data-step="Launch"]');
  await p.click(".hg-summary button[data-ready]");
  await p.waitForTimeout(300);
  await p.click(".hg-summary button[data-force]").catch(() => {});
  await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
  await p.waitForTimeout(1500);
  if (setup) await p.evaluate(setup);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(name, await p.evaluate(() => {
    const v = (window as unknown as { __arena: A }).__arena.view();
    return JSON.stringify(v.ships.map((s: any) => ({ bp: s.bp, hull: s.hull, crew: s.crew.length, mind: s.crew.filter((c: any) => c.mind).length, battery: s.battery, bonus: s.reactorBonus, arty: Object.values(s.systems).filter((x: any) => x.weapon).map((x: any) => `${x.id}:${(x.charge ?? 0).toFixed(1)}`) })));
  }));
  await p.close();
}
await run("fed-vs-flagship", "PLAYER_SHIP_FED", "BOSS_1", 12000);

await browser.close();
