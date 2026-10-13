/**
 * Survival round 2 checks: the Intruders warning, selecting crew after the enemy is destroyed (aftermath),
 * the FTL charge widget, and the jump (gradient wipe nose→tail with a flare at the rear).
 * Usage: ARENA_URL=http://localhost:8793 npx tsx tools/align/survival2.ts   (traces/survival2/)
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/survival2";
mkdirSync(out, { recursive: true });
type A = { state(): any; toScreen(x: number, y: number): { x: number; y: number } };
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
const hit = (sel: string, n: number) => p.evaluate(([s, k]) => { const el = document.querySelector<HTMLButtonElement>(s as string); for (let i = 0; i < (k as number); i++) el?.click(); return !!el; }, [sel, n] as const);
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(500);
await p.selectOption('select[data-cfg="winCondition"]', "survival");
await p.waitForTimeout(400);
await p.click('button[data-step="Ship"]');
await p.click("button[data-ship]");
await p.waitForTimeout(400);
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(1500);
await hit('#debug [data-op="boarder"][data-who="me"]', 1);
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/1-intruders.png` });
await hit('#debug [data-op="hull"][data-who="them"][data-delta="-5"]', 20);
await p.waitForTimeout(4000);
// Aftermath: click our first crew member's box on the left; it should select.
const st = await p.evaluate(() => (window as unknown as { __arena: A }).__arena.state());
const box = st.crewHit[0];
const at = await p.evaluate(([x, y]) => (window as unknown as { __arena: A }).__arena.toScreen(x, y), [box.x + box.w / 2, box.y + box.h / 2]);
await p.mouse.click(at.x, at.y);
await p.waitForTimeout(400);
console.log("aftermath: selected after a click:", JSON.stringify((await p.evaluate(() => (window as unknown as { __arena: A }).__arena.state())).selected));
await p.screenshot({ path: `${out}/2-aftermath.png` });
// Once the wreck has burned out the hostiles window goes and our ship snaps to the middle.
await p.waitForTimeout(5000);
await p.screenshot({ path: `${out}/2b-window-cleared.png` });
// Paused: the FTL charge and countdown sit under the tint and the PAUSED banner.
await p.keyboard.press("Space");
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/2c-paused.png` });
await p.keyboard.press("Space");
await p.waitForSelector(".reward", { timeout: 80000 });
await p.click(".rcard >> nth=0");
const t0 = Date.now();
for (let i = 0; Date.now() - t0 < 3200; i++) await p.screenshot({ path: `${out}/3-jump${String(i).padStart(2, "0")}-${Date.now() - t0}ms.jpg`, type: "jpeg", quality: 55, clip: { x: 0, y: 90, width: 650, height: 540 } });
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/4-battle2.png` });
console.log("battle 2: boarder still aboard:", await p.evaluate(() => { const v = (window as any).__arena.view(); return v.ships[v.you].crew.filter((c: any) => c.owner !== v.you && !c.dead).length; }));
await b.close();
