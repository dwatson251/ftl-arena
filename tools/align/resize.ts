/** One window resize re-fits the battle straight away (no second resize needed).  Usage: ARENA_URL=... npx tsx tools/align/resize.ts */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(500);
await p.locator(".hg-step", { hasText: "Launch" }).click();
await p.click('button[data-ready="1"]');
const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
if (force) await force.click();
await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
await p.waitForTimeout(1500);
// The battle's 1280x720 logical box: its bottom-right corner on screen, against the canvas size.
const fit = () => p.evaluate(() => { const c = (window as any).__arena.toScreen(1280, 720); const cv = document.querySelector("canvas")!; return { corner: [Math.round(c.x), Math.round(c.y)], canvas: [cv.clientWidth, cv.clientHeight] }; });
console.log("start:", JSON.stringify(await fit()));
await p.setViewportSize({ width: 900, height: 560 });
await p.waitForTimeout(300);
console.log("after one resize to 900x560:", JSON.stringify(await fit()));
await b.close();
