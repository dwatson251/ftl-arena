/**
 * Two players on a dedicated server that has no FTL (DED, e.g. localhost:8794): each page's art comes from its
 * own server (ARENA_URL, a Vite dev client), and the battle draws with it (traces/dedicated/).
 * Usage: ARENA_URL=http://localhost:5179 DED=localhost:8794 npx tsx tools/align/dedicated.ts
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const DED = process.env.DED ?? "localhost:8794";
mkdirSync("traces/dedicated", { recursive: true });
const b = await chromium.launch();
const open = async (name: string): Promise<Page> => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on("pageerror", (e) => console.log(`${name} pageerror:`, e.message));
  await p.goto(`${URL}/?server=${DED}`);
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  await p.click('[data-mode="online"]');
  await p.waitForTimeout(300);
  return p;
};
const a = await open("A");
await a.click("#create");
await a.waitForSelector(".hg-step");
await a.waitForTimeout(600);
const code = (await a.$eval(".code", (e) => e.textContent ?? "")).trim();
console.log("lobby on the dedicated server:", code);
const bb = await open("B");
await bb.fill("#code", code);
await bb.click("#join");
await bb.waitForSelector(".hg-step");
await bb.waitForTimeout(600);
for (const p of [a, bb]) {
  await p.click('button[data-step="Launch"]');
  await p.click('button[data-ready="1"]');
  const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
  if (force) await force.click();
}
await a.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 30000 });
await a.waitForTimeout(3000);
console.log("A's art:", await a.evaluate(() => (window as any).__arena?.view?.() ? "battle" : "no view"), "| db source:", await a.evaluate(() => document.body.classList.contains("ftl-fonts") ? "FTL fonts on" : "no FTL fonts"));
await a.screenshot({ path: "traces/dedicated/battle.png" });
await b.close();
