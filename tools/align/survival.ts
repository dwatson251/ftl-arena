/**
 * Survival end to end: pick it in Rules (only Ship and Launch stay open), launch, win (debug), the aftermath
 * with the FTL charge, the reward cards, the jump, battle 2, then lose for the game-over tally.
 * Usage: ARENA_URL=http://localhost:8793 npx tsx tools/align/survival.ts   (screenshots in traces/survival/)
 */
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/survival";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(20000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
const shot = (n: string) => p.screenshot({ path: `${out}/${n}.png` });
const hit = (sel: string, n: number) => p.evaluate(([s, k]) => { const el = document.querySelector<HTMLButtonElement>(s as string); for (let i = 0; i < (k as number); i++) el?.click(); return !!el; }, [sel, n] as const);
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(600);
await p.selectOption('select[data-cfg="winCondition"]', "survival");
await p.waitForTimeout(600);
console.log("tabs:", await p.$$eval(".hg-step", (es) => es.map((e) => `${e.textContent?.replace(/\d/g, "").trim()}${(e as HTMLButtonElement).disabled ? "(off)" : ""}`).join(" ")));
await shot("1-rules");
await p.click('button[data-step="Ship"]');
await p.waitForTimeout(400);
await p.click("button[data-ship]");
await p.waitForTimeout(600);
console.log("after picking a ship:", await p.$eval(".hg-step.on", (e) => e.textContent?.replace(/\d/g, "").trim()), "| save box:", !!(await p.$(".save-box")));
await shot("2-launch");
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(2000);
await shot("3-battle1");
await hit('#debug [data-op="hull"][data-who="them"][data-delta="-5"]', 20);
await p.waitForTimeout(6000);
await shot("4-aftermath");
await p.waitForSelector(".reward", { timeout: 30000 });
await p.waitForTimeout(300);
console.log("cards:", await p.$$eval(".rcard", (es) => es.map((e) => `[${e.className.replace("rcard ", "")}] ${e.querySelector(".rtitle")?.textContent}`).join(" | ")));
await shot("5-reward");
await p.click(".rcard >> nth=0");
// The jump and the arrival, as fast as screenshots go (small JPEGs of the player's side).
const t0 = Date.now();
for (let i = 0; Date.now() - t0 < 6500; i++) {
  await p.screenshot({ path: `${out}/6-jump${String(i).padStart(2, "0")}-${Date.now() - t0}ms.jpg`, type: "jpeg", quality: 50, clip: { x: 0, y: 90, width: 650, height: 540 } });
}
await p.waitForTimeout(1500);
await shot("7-battle2");
console.log("HUD after the jump: battle 2 started:", await p.evaluate(() => !document.querySelector(".reward")));
await hit('#debug [data-op="hull"][data-who="me"][data-delta="-5"]', 20);
await p.waitForSelector("text=SHIP DESTROYED", { timeout: 30000 });
await p.waitForTimeout(300);
console.log("game over:", (await p.$eval(".overlay .menu", (e) => e.textContent?.replace(/\s+/g, " ").trim())) ?? "");
await shot("8-gameover");
await b.close();
