/**
 * Controller play end to end with a scripted gamepad (navigator.getGamepads replaced): Settings, D-pad menus
 * (focus ring, editing a number), the lobby icon, then in battle the weapon wheel (pause, pick, autofire),
 * a tap to clear, and LB + A to power down.  Usage: ARENA_URL=... npx tsx tools/align/controller.ts
 */
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/controller";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => {
  const st = { buttons: Array(17).fill(false) as boolean[], axes: [0, 0, 0, 0] };
  (window as any).__pad = st;
  navigator.getGamepads = () => [{ id: "Scripted Xbox pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: st.buttons.map((x) => ({ pressed: x, touched: x, value: x ? 1 : 0 })), axes: st.axes } as unknown as Gamepad];
});
const set = (btn: number, on: boolean) => p.evaluate(([i, v]) => ((window as any).__pad.buttons[i as number] = v), [btn, on] as const);
const stick = (x: number, y: number) => p.evaluate(([a, c]) => ((window as any).__pad.axes = [a, c, 0, 0]), [x, y] as const);
const tap = async (btn: number) => { await set(btn, true); await p.waitForTimeout(80); await set(btn, false); await p.waitForTimeout(120); };
const focused = (pg: Page) => pg.evaluate(() => { const e = document.activeElement as HTMLElement | null; return e ? `${e.tagName}${e.id ? "#" + e.id : ""} ${(e.textContent ?? (e as HTMLInputElement).value ?? "").trim().slice(0, 20)} ring=${e.classList.contains("pad-focus")}` : "none"; });
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click('[data-mode="settings"]');
await p.check("#controller");
await p.waitForTimeout(600);
console.log("settings:", (await p.$eval(".tab-body", (e) => e.textContent?.replace(/\s+/g, " ").slice(0, 120))) ?? "");
await p.screenshot({ path: `${out}/1-settings.png` });
// D-pad around the main menu.
await tap(13); await tap(13);
console.log("after ↓↓:", await focused(p));
await p.screenshot({ path: `${out}/2-menu-focus.png` });
await p.click('[data-mode="lan"]');
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(800);
console.log("lobby icon:", !!(await p.$(".players .pad-icon")));
// Edit the scrap number with the pad: focus it, A to edit, ↑ to raise, A to submit.
// D-pad down from the top of the Rules form until the ring is on the scrap box, then A ↑ A.
for (let i = 0; i < 24; i++) {
  const on = await p.evaluate(() => document.querySelector(".pad-focus")?.getAttribute("data-cfg"));
  if (on === "scrap") break;
  // Into the Rules form with →, then down it with ↓.
  if (process.env.TRACE) console.log("  ring:", await p.evaluate(() => { const e = document.querySelector(".pad-focus"); return e ? `${e.tagName} ${[...e.attributes].map((x) => x.name + "=" + x.value).join(" ").slice(0, 60)} ${(e.textContent ?? "").trim().slice(0, 15)}` : "none"; }));
  // Off the tabs with ↓, into the form with →, then ↑ or ↓ toward the scrap box (straight up or down the column).
  const step = await p.evaluate(() => {
    const ring = document.querySelector(".pad-focus");
    if (!ring || ring.classList.contains("hg-step")) return 13;
    if (!ring.getAttribute("data-cfg")) return 15;
    const t = document.querySelector('input[data-cfg="scrap"]')!.getBoundingClientRect().top;
    return t < ring.getBoundingClientRect().top ? 12 : 13;
  });
  await tap(step);
}
console.log("ring on:", await p.evaluate(() => document.querySelector(".pad-focus")?.outerHTML.slice(0, 60)));
await tap(0); await tap(12); await tap(0);
await p.waitForTimeout(600);
console.log("scrap after A ↑ A:", await p.$eval('input[data-cfg="scrap"]', (e) => (e as HTMLInputElement).value), "| summary:", await p.$eval(".rules-summary", (e) => e.textContent?.replace(/\s+/g, " ").slice(0, 60)));
await p.screenshot({ path: `${out}/3-hangar-edit.png` });
await p.locator(".hg-step", { hasText: "Launch" }).click();
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(2500);
const view = () => p.evaluate(() => { const v = (window as any).__arena.view(); const w = v.ships[v.you].weapons[0]; return { paused: !!v.pause, target: w?.target, autofire: w?.autofire, powered: w?.powered }; });
// Hold A: the wheel opens and time stops; push up to the first choice and let go.
await set(0, true);
await p.waitForTimeout(600);
console.log("A held:", JSON.stringify(await view()));
await stick(0, -1);
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/4-wheel.png` });
await set(0, false);
await stick(0, 0);
await p.waitForTimeout(600);
console.log("released on a choice:", JSON.stringify(await view()));
await tap(0);
await p.waitForTimeout(400);
console.log("tap A (clear):", JSON.stringify(await view()));
const w2 = () => p.evaluate(() => { const v = (window as any).__arena.view(); return v.ships[v.you].weapons[1]?.powered; });
console.log("weapon 2 powered before LB + B:", await w2());
await set(4, true); await tap(1); await set(4, false);
await p.waitForTimeout(800);
console.log("weapon 2 powered after LB + B:", await w2());
await p.screenshot({ path: `${out}/5-battle.png` });
await b.close();
