/** Survival's reward cards with a controller: the first card focused at once, button badges, B picks card 2
 *  (traces/cards-pad/).  Usage: ARENA_URL=<vite dev> npx tsx tools/align/cards-pad.ts */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
mkdirSync("traces/cards-pad", { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(30000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => {
  localStorage.setItem("ftl-arena-controller", "1");
  const st = { buttons: Array(17).fill(false) as boolean[], axes: [0, 0, 0, 0] };
  (window as any).__pad = st;
  navigator.getGamepads = () => [{ id: "Scripted pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: st.buttons.map((x) => ({ pressed: x, touched: x, value: x ? 1 : 0 })), axes: st.axes } as unknown as Gamepad];
});
const tap = async (btn: number) => { await p.evaluate((i) => ((window as any).__pad.buttons[i] = true), btn); await p.waitForTimeout(80); await p.evaluate((i) => ((window as any).__pad.buttons[i] = false), btn); await p.waitForTimeout(300); };
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(600);
await p.selectOption('select[data-cfg="winCondition"]', "survival");
await p.waitForTimeout(600);
await p.click('button[data-step="Ship"]');
await p.click("button[data-ship]");
await p.waitForTimeout(600);
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(1500);
await p.evaluate(() => { for (let i = 0; i < 20; i++) document.querySelector<HTMLButtonElement>('#debug [data-op="hull"][data-who="them"][data-delta="-5"]')?.click(); });
await p.waitForSelector(".reward", { timeout: 40000 });
await p.waitForTimeout(500);
console.log("focused card:", await p.evaluate(() => document.querySelector(".pad-focus")?.getAttribute("data-pick")), "| badges:", await p.$$eval(".rcard .padbtn", (es) => es.map((e) => e.textContent).join(" ")));
await p.screenshot({ path: "traces/cards-pad/1-cards.png" });
const titles = await p.$$eval(".rcard .rtitle", (es) => es.map((e) => e.textContent));
// Watch for the pick: the card is marked, then the cards go as the jump starts.
await p.evaluate(() => {
  (window as any).__picked = "";
  document.addEventListener("click", (e) => {
    const c = (e.target as HTMLElement).closest(".rcard");
    if (c) (window as any).__picked = c.querySelector(".rtitle")?.textContent ?? "";
  }, true);
});
await tap(1);
await p.waitForTimeout(1500);
console.log("picked:", await p.evaluate(() => (window as any).__picked), "(card 2 was", titles[1] + ") | cards gone:", !(await p.$(".overlay.reward")));
await b.close();
