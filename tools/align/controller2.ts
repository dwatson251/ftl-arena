/**
 * Controller round 2 with a scripted pad: the button icons beside the HUD (no AUTOFIRE, no top hint line), a
 * tap on A powering weapon 1, the LB systems wheel with D-pad ↑/↓ power, and the door buttons (↑ opens, then
 * airlocks; ↓ closes round the crew, then everything).  Usage: ARENA_URL=... npx tsx tools/align/controller2.ts
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/controller2";
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => {
  localStorage.setItem("ftl-arena-controller", "1");
  const st = { buttons: Array(17).fill(false) as boolean[], axes: [0, 0, 0, 0] };
  (window as any).__pad = st;
  navigator.getGamepads = () => [{ id: "Scripted Xbox pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: st.buttons.map((x) => ({ pressed: x, touched: x, value: x ? 1 : 0 })), axes: st.axes } as unknown as Gamepad];
});
const set = (btn: number, on: boolean) => p.evaluate(([i, v]) => ((window as any).__pad.buttons[i as number] = v), [btn, on] as const);
const stick = (x: number, y: number) => p.evaluate(([a, c]) => ((window as any).__pad.axes = [a, c, 0, 0]), [x, y] as const);
const tap = async (btn: number) => { await set(btn, true); await p.waitForTimeout(80); await set(btn, false); await p.waitForTimeout(250); };
const own = () => p.evaluate("(() => { const v = window.__arena.view(); return v.ships[v.you]; })()") as Promise<any>;
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(600);
// SHIP=<hull id> flies that hull instead (one with a teleporter and hacking shows every icon).
if (process.env.SHIP) {
  await p.click('button[data-step="Ship"]');
  await p.click(`button[data-ship="${process.env.SHIP}"]`);
  await p.waitForTimeout(600);
}
await p.click('button[data-step="Launch"]');
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(800);
await p.click("#debug [data-toggle]").catch(() => {});
await p.addStyleTag({ content: "#debug { display: none !important; }" });
await tap(0); // a first press, so the battle knows a pad is in use
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/1-glyphs.png` });

// B (weapon 2; the Kestrel's Artemis has no missiles here): LB + B powers it down, a tap powers it back up.
await set(4, true); await tap(1); await set(4, false); await p.waitForTimeout(400);
console.log("weapon 2 after LB+B:", (await own()).weapons[1].powered);
await set(1, true); await p.waitForTimeout(80); await set(1, false); await p.waitForTimeout(60);
await p.screenshot({ path: `${out}/1b-tap.png` });
await p.waitForTimeout(400);
console.log("weapon 2 after a tap on B:", (await own()).weapons[1].powered);

// The LB wheel: hold, point up (the first system), ↓ then ↑.
const first = await p.evaluate("(() => { const v = window.__arena.view(); const s = v.ships[v.you].systems; return Object.values(s).filter(x => x && !['pilot','sensors','doors','battery'].includes(x.id))[0].id; })()") as string;
const pw = async () => (await own()).systems[first].power;
console.log("first system:", first, "power", await pw());
await set(4, true);
await p.waitForTimeout(450);
await stick(0, -1);
await p.waitForTimeout(250);
await stick(0, 0); // let go of the stick: the pick stays
await p.waitForTimeout(150);
await p.screenshot({ path: `${out}/2-lb-wheel.png` });
await tap(13); await p.waitForTimeout(300);
console.log(`${first} after ↓:`, await pw());
await tap(12); await p.waitForTimeout(300);
console.log(`${first} after ↑:`, await pw());
await set(4, false);
await p.waitForTimeout(300);

// Doors.
const doors = async () => { const o = await own(); const g = await p.evaluate("(() => { const v = window.__arena.view(); return null; })()"); return o.doors.filter(Boolean).length + "/" + o.doors.length; };
console.log("doors open at start:", await doors());
await tap(12); await p.waitForTimeout(400);
console.log("after ↑:", await doors());
await tap(12); await p.waitForTimeout(400);
console.log("after ↑ again (airlocks):", await doors());
await tap(13); await p.waitForTimeout(400);
console.log("after ↓ (round the crew):", await doors());
await tap(13); await p.waitForTimeout(400);
console.log("after ↓ again (all):", await doors());
await p.screenshot({ path: `${out}/3-after.png` });
await b.close();
