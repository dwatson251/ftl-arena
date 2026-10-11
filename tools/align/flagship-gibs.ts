/** The flagship's stage ends like any hull: blasts, then it breaks into its gibs. traces/flagship/gib*.png */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(800);
await p.selectOption('select[data-prac="botShip"]', process.argv[2] ?? "BOSS_1");
await p.waitForTimeout(400);
await p.locator(".hg-step", { hasText: "Launch" }).click();
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(1500);
// Knock the hull down in one go (from the page, so no click latency), then watch.
await p.evaluate(() => {
  const b = document.querySelector<HTMLButtonElement>('#debug [data-op="hull"][data-who="them"][data-delta="-5"]')!;
  for (let i = 0; i < 14; i++) b.click();
});
for (let i = 0; i < 10; i++) {
  await p.waitForTimeout(200);
  await p.screenshot({ path: `traces/flagship/gib${i}.png`, clip: { x: 640, y: 120, width: 310, height: 400 } });
}
await browser.close();
