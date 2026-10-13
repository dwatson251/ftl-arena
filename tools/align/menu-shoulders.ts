/** Controller on the FTL-style main menu and in the hangar (scripted pad): the D-pad through the title
 *  buttons, A opens a panel, LB / RB step between panels, B goes back; LB / RB step the hangar's steps.
 *  Usage: ARENA_URL=... npx tsx tools/align/menu-shoulders.ts */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => {
  localStorage.setItem("ftl-arena-controller", "1");
  localStorage.setItem("ftl-arena-name", "Pad");
  const st = { buttons: Array(17).fill(false) as boolean[], axes: [0, 0, 0, 0] };
  (window as any).__pad = st;
  navigator.getGamepads = () => [{ id: "Scripted pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: st.buttons.map((x) => ({ pressed: x, touched: x, value: x ? 1 : 0 })), axes: st.axes } as unknown as Gamepad];
});
const tap = async (btn: number) => { await p.evaluate((i) => ((window as any).__pad.buttons[i] = true), btn); await p.waitForTimeout(80); await p.evaluate((i) => ((window as any).__pad.buttons[i] = false), btn); await p.waitForTimeout(300); };
const ring = () => p.evaluate(() => document.querySelector(".pad-focus")?.textContent?.trim() ?? "none");
const panel = () => p.evaluate(() => document.querySelector(".mm-panel h1")?.textContent ?? "(title screen)");
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.waitForTimeout(500);
await tap(13); console.log("↓ ring:", await ring());
await tap(13); console.log("↓ ring:", await ring());
await tap(0); console.log("A opens:", await panel());
await tap(5); console.log("RB →", await panel());
await tap(5); console.log("RB →", await panel());
await tap(4); console.log("LB →", await panel());
await tap(1); console.log("B →", await panel());
// Into the hangar: LB / RB step the build steps.
await p.click('[data-open="single"]');
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(600);
const step = () => p.$eval(".hg-step.on", (e) => e.textContent?.replace(/\d/g, "").trim());
console.log("hangar:", await step());
await tap(5); console.log("RB →", await step());
await tap(5); console.log("RB →", await step());
await tap(4); console.log("LB →", await step());
await b.close();
