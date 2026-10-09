/**
 * Browser end-to-end: two Chromium pages create/join a lobby, build loadouts, ready up and fight.
 * Screenshots land in traces/. Needs the server and the client dev server running.
 *   npx tsx tools/bench/e2e.ts [http://localhost:5173] [--win crew] [--secs 40]
 */
import { chromium, type Page } from "playwright";

const args = process.argv.slice(2);
const URL = args.find((a) => a.startsWith("http")) ?? "http://localhost:5173";
const get = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const win = get("--win", "hull");
const secs = Number(get("--secs", "40"));
const out = get("--out", "traces");

const browser = await chromium.launch();
const ctx = (n: string) => browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }).then(async (c) => {
  const p = await c.newPage();
  p.on("console", (m) => m.type() === "error" && console.log(`[${n}] console:`, m.text()));
  p.on("pageerror", (e) => console.log(`[${n}] pageerror:`, e.message));
  return p;
});
const a = await ctx("A");
const b = await ctx("B");
const shot = (p: Page, name: string) => p.screenshot({ path: `${out}/${name}.png` });

await a.goto(URL);
await b.goto(URL);
await a.waitForSelector("#create:not([disabled])");
await a.fill("#name", "Alice");
await a.click("#create");
await a.waitForSelector(".code");
const code = (await a.textContent(".code"))!.trim();
console.log("lobby", code);
await b.fill("#name", "Bob");
await b.fill("#code", code);
await b.click("#join");
await b.waitForSelector(".code");
await a.waitForFunction(() => document.querySelectorAll(".players .p").length === 2);
if (win === "crew") await a.selectOption('select[data-cfg="winCondition"]', "crew");
await a.fill('input[data-cfg="scrap"]', "400");
await a.dispatchEvent('input[data-cfg="scrap"]', "change");
if (args.includes("--limit")) {
  await a.fill('input[data-cfg="timeLimit"]', get("--limit", "60"));
  await a.dispatchEvent('input[data-cfg="timeLimit"]', "change");
}
await a.waitForTimeout(400);
// Alice upgrades shields and buys a weapon; Bob picks another hull.
await a.click('button[data-sys="shields"][data-d="1"]');
await a.click('button[data-sys="shields"][data-d="1"]');
await a.click('button[data-buy="LASER_HEAVY_1"]').catch(() => console.log("no LASER_HEAVY_1 in store"));
await b.selectOption("select[data-ship]", { index: Number(get("--bob-ship", "3")) }).catch((e) => console.log("select failed", e.message));
await b.waitForTimeout(300);
console.log("bob hull:", await b.$eval("select[data-ship]", (el) => (el as HTMLSelectElement).value));
await b.click('button[data-sys="engines"][data-d="1"]').catch(() => {});
await a.waitForTimeout(800);
await shot(a, "01-hangar-alice");
await shot(b, "02-hangar-bob");
console.log("alice errors:", await a.$$eval(".toast, .err", (els) => els.map((e) => e.textContent)));
await a.click("button[data-ready]");
await b.click("button[data-ready]");
await a.waitForFunction(() => !document.querySelector(".hangar"), null, { timeout: 15000 });
console.log("battle started");
await a.waitForTimeout(1500);
await shot(a, "03-battle-start");
// Alice: power weapons, target enemy rooms via clicks on the canvas: weapon box 1 then enemy ship centre.
const canvasClick = async (p: Page, x: number, y: number, button: "left" | "right" = "left") => p.mouse.click(x, y, { button });
for (const p of [a, b]) {
  for (const k of ["1", "2", "3"]) {
    await p.keyboard.press(k);
    await p.waitForTimeout(100);
  }
}
await a.waitForTimeout(500);
await shot(a, "04-weapons-powered");
for (const p of [a, b]) {
  await p.keyboard.press("Escape");
  for (const [slot, ex, ey] of [[0, 1050, 300], [1, 1000, 340], [2, 1100, 330]] as const) {
    await canvasClick(p, 470 + slot * 140 + 60, 640); // select weapon
    await p.waitForTimeout(80);
    await canvasClick(p, ex, ey); // target
    await p.waitForTimeout(80);
    await canvasClick(p, 470 + slot * 140 + 60, 688); // autofire
  }
}
// Alice moves all crew around a bit: Tab selects all, right-click a room on her own ship.
await a.keyboard.press("Tab");
await a.waitForTimeout(100);
await shot(a, "05-targets-set");
const t0 = Date.now();
let n = 6;
while (Date.now() - t0 < secs * 1000) {
  await a.waitForTimeout(5000);
  await shot(a, `${String(n++).padStart(2, "0")}-battle-${Math.round((Date.now() - t0) / 1000)}s`);
  const over = await a.$(".overlay");
  if (over) break;
}
await shot(b, `${String(n++).padStart(2, "0")}-bob-view`);
const ov = await a.$(".overlay");
console.log("overlay:", ov ? (await ov.textContent())?.replace(/\s+/g, " ").trim() : "none (still fighting)");
await browser.close();
