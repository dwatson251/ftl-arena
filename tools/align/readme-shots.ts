/**
 * The README's screenshots (docs/images/): the main menu, Rules, the hangar, a battle, the controller wheel and
 * Survival's reward cards. Run against a Vite dev client (the debug drawer wins Survival's first battle fast; it's
 * folded away and hidden for the shots, as in a release).
 * Usage: ARENA_URL=http://localhost:5179 npx tsx tools/align/readme-shots.ts
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "docs/images";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

async function page(pad = false): Promise<Page> {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.setDefaultTimeout(30000);
  await p.addInitScript(() => localStorage.setItem("ftl-arena-name", "Captain"));
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  if (pad)
    await p.addInitScript(() => {
      localStorage.setItem("ftl-arena-controller", "1");
      const st = { buttons: Array(17).fill(false) as boolean[], axes: [0, 0, 0, 0] };
      (window as any).__pad = st;
      navigator.getGamepads = () => [{ id: "Scripted Xbox pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: st.buttons.map((x) => ({ pressed: x, touched: x, value: x ? 1 : 0 })), axes: st.axes } as unknown as Gamepad];
    });
  await p.goto(URL);
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  await p.waitForTimeout(800);
  return p;
}
const shot = (p: Page, n: string) => p.screenshot({ path: `${out}/${n}.png` });
async function launch(p: Page): Promise<void> {
  await p.click('button[data-step="Launch"]');
  await p.click('button[data-ready="1"]');
  const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
  if (force) await force.click();
  await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
  await p.waitForTimeout(800);
}
/** Fold the debug drawer and hide its tab: what a release build shows. */
async function noDebug(p: Page): Promise<void> {
  await p.click("#debug [data-toggle]").catch(() => {});
  await p.addStyleTag({ content: "#debug { display: none !important; }" });
  await p.waitForTimeout(500);
}

// Menu, Rules (Tournament), the hangar.
let p = await page();
await shot(p, "menu");
await p.click('[data-open="single"]');
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(800);
await p.selectOption('select[data-cfg="costs"]', "tournament");
await p.waitForTimeout(800);
await shot(p, "rules");
await p.click('button[data-step="Ship"]');
await p.waitForTimeout(800);
await shot(p, "hangar");
await p.close();

// A battle in full swing.
p = await page();
await p.click('[data-open="single"]');
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(800);
await launch(p);
await noDebug(p);
await p.waitForTimeout(30000);
await shot(p, "battle");
await p.close();

// The controller's weapon wheel.
p = await page(true);
const set = (btn: number, on: boolean) => p.evaluate(([i, v]) => ((window as any).__pad.buttons[i as number] = v), [btn, on] as const);
const stick = (x: number, y: number) => p.evaluate(([a, c]) => ((window as any).__pad.axes = [a, c, 0, 0]), [x, y] as const);
await p.click('[data-open="single"]');
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(800);
await launch(p);
await noDebug(p);
await p.waitForTimeout(6000);
await set(0, true);
await p.waitForTimeout(500);
await stick(0, -1);
await p.waitForTimeout(400);
await shot(p, "wheel");
await stick(0, 0);
await set(0, false);
await p.close();

// Survival: win the first battle (debug), then the reward cards.
p = await page();
await p.click('[data-open="single"]');
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(600);
await p.selectOption('select[data-cfg="winCondition"]', "survival");
await p.waitForTimeout(600);
await p.click('button[data-step="Ship"]');
await p.waitForTimeout(400);
await p.click("button[data-ship]");
await p.waitForTimeout(600);
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(1500);
await p.evaluate(() => { for (let i = 0; i < 20; i++) document.querySelector<HTMLButtonElement>('#debug [data-op="hull"][data-who="them"][data-delta="-5"]')?.click(); });
await noDebug(p);
await p.waitForSelector(".reward", { timeout: 40000 });
await p.waitForTimeout(600);
await shot(p, "survival");
await b.close();
console.log("done:", out);
