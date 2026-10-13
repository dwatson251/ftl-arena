/**
 * Practice-mode walkthrough in one Chromium page: every hangar step, the battle, the debug drawer, then
 * 8× speed until the end screen. Screenshots in traces/practice/.
 *   npx tsx tools/bench/practice-e2e.ts [http://localhost:5173] [--difficulty 40] [--god]
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith("http")) ?? "http://localhost:5173";
const get = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const out = "traces/practice";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: args.includes("--video") ? { dir: `${out}/video`, size: { width: 1280, height: 720 } } : undefined });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
p.on("console", (m) => m.type() === "error" && !m.text().includes("404") && console.log("console:", m.text()));
const shot = (n: string) => p.screenshot({ path: `${out}/${n}.png` });
/** Click at logical battle coordinates. */
const click = async (x: number, y: number, button: "left" | "right" = "left") => {
  const s = await p.evaluate(([a, b]) => (window as unknown as { __arena: { toScreen(x: number, y: number): { x: number; y: number } } }).__arena.toScreen(a, b), [x, y]);
  await p.mouse.click(s.x, s.y, { button });
};
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.fill("#name", "Tester");
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(800);
await shot("01-ship");
await p.click('button[data-ship="PLAYER_SHIP_HARD"]');
await p.click('button[data-step="Systems"]');
await p.click('button[data-sys="shields"][data-d="1"]');
await p.click('button[data-sys="shields"][data-d="1"]');
await p.waitForTimeout(300);
await shot("02-systems");
await p.click('button[data-step="Weapons"]');
await p.click('button[data-buy="LASER_HEAVY_1"]').catch(() => console.log("no heavy laser"));
await p.waitForTimeout(500);
await shot("03-weapons");
await p.click('button[data-step="Crew"]');
await p.click('button[data-hire="engi"]').catch(() => console.log("no engi"));
await p.fill('input[data-crewname="0"]', "Ripley");
await p.press('input[data-crewname="0"]', "Tab");
await p.waitForTimeout(500);
await shot("04-crew");
const diff = get("--difficulty", "40");
await p.$eval('input[data-prac="difficulty"]', (el, v) => {
  (el as HTMLInputElement).value = v;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}, diff);
await p.click('button[data-step="Launch"]');
await p.waitForTimeout(300);
await shot("05-launch");
console.log("errors:", await p.$$eval(".err", (e) => e.map((x) => x.textContent)));
await p.click("button[data-ready]");
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.waitForTimeout(1500);
await shot("06-battle-start");
// Power everything and target: weapon boxes are at x0=430+14+i*97, y≈626+13.
for (let i = 0; i < 3; i++) {
  await p.keyboard.press("Escape");
  await click(444 + i * 97 + 45, 668);
  await p.waitForTimeout(120);
}
for (let i = 0; i < 3; i++) {
  await p.keyboard.press("Escape");
  await click(444 + i * 97 + 45, 668); // arm
  await p.waitForTimeout(80);
  await click(1067, 260 + i * 70); // enemy window
  await p.waitForTimeout(80);
}
await click(444 + 3 * 97 + 6 + 15, 670); // autofire all
// Select two crew (crew list) and send them to a room to see the destination tiles.
await click(60, 185);
await click(60, 230, "left");
await p.keyboard.down("Shift");
await click(60, 185);
await p.keyboard.up("Shift");
await click(470, 330, "right");
await p.waitForTimeout(250);
await shot("07-orders");
await p.waitForTimeout(4000);
await shot("08-firing");
const zoom = async (name: string, x: number, y: number, w: number, hgt: number) => {
  const a = await p.evaluate(([a, b]) => (window as unknown as { __arena: { toScreen(x: number, y: number): { x: number; y: number } } }).__arena.toScreen(a, b), [x, y]);
  const b = await p.evaluate(([a, b]) => (window as unknown as { __arena: { toScreen(x: number, y: number): { x: number; y: number } } }).__arena.toScreen(a, b), [x + w, y + hgt]);
  await p.screenshot({ path: `${out}/${name}.png`, clip: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y } });
};
if (args.includes("--burst")) {
  // Wait for the bot's first volleys, then grab frames to see shots leave and enter the views.
  await p.waitForTimeout(Number(get("--wait", "7000")));
  for (let i = 0; i < 30; i++) {
    await shot(`burst-${String(i).padStart(2, "0")}`);
    await p.waitForTimeout(90);
  }
}
await zoom("zoom-weapons-hull", 380, 180, 360, 300);
await zoom("zoom-tray", 0, 520, 860, 200);
if (args.includes("--gibs")) {
  for (let i = 0; i < 7; i++) {
    await p.click('button[data-op="hull"][data-who="them"]');
    await p.waitForTimeout(150);
  }
  const t0 = Date.now();
  for (let i = 0; i < 24; i++) {
    const st = await p.evaluate(() => (window as unknown as { __arena: { state(): unknown } }).__arena.state());
    const ov = await p.evaluate(() => !!document.querySelector(".overlay"));
    console.log(((Date.now() - t0) / 1000).toFixed(2), JSON.stringify(st), ov ? "OVERLAY" : "");
    if (i === 2 || i === 6 || i === 12) await shot(`gib-${i}`);
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(1500);
  await shot("gib-end");
  await ctx.close();
  await browser.close();
  process.exit(0);
}
if (args.includes("--god")) await p.click('button[data-op="god"]');
await p.click('button[data-speed="8"]');
let n = 9;
for (let i = 0; i < 40; i++) {
  await p.waitForTimeout(1200);
  if (i % 4 === 0) await shot(`${String(n++).padStart(2, "0")}-fast`);
  const ended = await p.evaluate(() => !!document.querySelector(".overlay"));
  const exploding = await p.evaluate(() => document.querySelector(".debug")?.textContent ?? "");
  if (ended) break;
  void exploding;
}
await shot(`${String(n++).padStart(2, "0")}-end`);
console.log("overlay:", (await p.$(".overlay")) ? (await p.textContent(".overlay"))?.replace(/\s+/g, " ") : "none");
await ctx.close();
await browser.close();
