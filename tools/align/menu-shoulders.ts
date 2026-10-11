/** LB / RB (L1 / R1) step through the main menu's tabs and the hangar's steps (scripted pad).
 *  Usage: ARENA_URL=... npx tsx tools/align/menu-shoulders.ts */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => {
  localStorage.setItem("ftl-arena-controller", "1");
  const st = { buttons: Array(17).fill(false) as boolean[], axes: [0, 0, 0, 0] };
  (window as any).__pad = st;
  navigator.getGamepads = () => [{ id: "Scripted pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: st.buttons.map((x) => ({ pressed: x, touched: x, value: x ? 1 : 0 })), axes: st.axes } as unknown as Gamepad];
});
const tap = async (btn: number) => { await p.evaluate((i) => ((window as any).__pad.buttons[i] = true), btn); await p.waitForTimeout(80); await p.evaluate((i) => ((window as any).__pad.buttons[i] = false), btn); await p.waitForTimeout(300); };
const on = (sel: string) => p.$eval(`${sel}.on`, (e) => e.textContent?.replace(/\d/g, "").trim());
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.waitForTimeout(500);
console.log("menu:", await on(".tab"));
await tap(5); console.log("RB →", await on(".tab"));
await tap(5); console.log("RB →", await on(".tab"));
await tap(4); console.log("LB →", await on(".tab"));
await tap(4); await tap(4); console.log("LB LB (stops at the first) →", await on(".tab"));
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(600);
console.log("hangar:", await on(".hg-step"));
for (let i = 0; i < 3; i++) { await tap(5); console.log("RB →", await on(".hg-step"), "| ring:", await p.evaluate(() => document.querySelector(".pad-focus")?.textContent?.replace(/\d/g, "").trim())); }
await tap(4); console.log("LB →", await on(".hg-step"));
await b.close();
