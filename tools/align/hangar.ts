/**
 * The tidied hangar: the host opens on Rules (the lobby column only summarises them); a second player has no
 * Rules tab; building steps show the slim summary (no bill); Launch is full width with the hangar bay; and
 * nothing overflows at smaller sizes.   Usage: ARENA_URL=http://localhost:5180 npx tsx tools/align/hangar.ts
 */
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch();
const page = async (w = 1280, hgt = 720) => {
  const p = await (await b.newContext({ viewport: { width: w, height: hgt } })).newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.goto(URL);
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  return p;
};
const on = (p: Page) => p.$eval(".hg-step.on", (e) => e.textContent?.replace(/\d/g, "").trim());
const tabs = (p: Page) => p.$$eval(".hg-step", (es) => es.map((e) => e.textContent?.replace(/\d/g, "").trim()).join(" "));
const host = await page();
await host.click('[data-mode="online"]');
await host.fill("#name", "Host");
await host.fill("#server", "");
await host.click("#create");
await host.waitForSelector(".hg-step");
await host.waitForTimeout(400);
console.log("1 host opens on:", await on(host), "| tabs:", await tabs(host));
console.log("  lobby column inputs:", await host.$$eval(".hg-side input, .hg-side select", (e) => e.length), "| summary:", JSON.stringify(await host.$eval(".rules-summary", (e) => e.textContent?.replace(/\s+/g, " ").trim())));
await host.screenshot({ path: "traces/hangar/1-rules.png" });
await host.fill('[data-cfg="scrap"]', "550");
await host.dispatchEvent('[data-cfg="scrap"]', "change");
await host.waitForTimeout(400);
console.log("  after scrap 550, summary:", JSON.stringify(await host.$eval(".rules-summary", (e) => e.textContent?.match(/\d+ scrap/)?.[0])));
const code = (await host.$eval(".code", (e) => e.textContent ?? "")).trim();
const friend = await page();
await friend.click('[data-mode="online"]');
await friend.fill("#name", "Friend");
await friend.fill("#server", "localhost:8790");
await friend.fill("#code", code);
await friend.click("#join");
await friend.waitForSelector(".hg-step");
await friend.waitForTimeout(400);
console.log("2 friend opens on:", await on(friend), "| tabs:", await tabs(friend), "| sees:", JSON.stringify(await friend.$eval(".rules-summary", (e) => e.textContent?.replace(/\s+/g, " ").trim())));
await host.click('.hg-steps button[data-step="Systems"]');
await host.waitForTimeout(300);
console.log("3 systems: summary panel:", !!(await host.$(".hg-summary")), "| has Bill:", (await host.$eval(".hg-summary", (e) => e.textContent ?? "")).includes("Bill"));
await host.screenshot({ path: "traces/hangar/2-systems.png" });
await host.click('.hg-summary button[data-step]');
await host.waitForTimeout(300);
console.log("  next button →", await on(host));
await host.click('.hg-steps button[data-step="Launch"]');
await host.waitForTimeout(1500);
console.log("4 launch: summary panel:", !!(await host.$(".hg-summary")), "| bay canvas:", !!(await host.$(".bay-canvas")), "| music picker:", !!(await host.$("[data-music]")), "| save box:", !!(await host.$(".save-box")));
await host.screenshot({ path: "traces/hangar/3-launch.png" });
for (const [w, hh] of [[1024, 640], [800, 600]]) {
  await host.setViewportSize({ width: w, height: hh });
  await host.waitForTimeout(500);
  const o = await host.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, screen: (() => { const s = document.querySelector(".hangar-screen") as HTMLElement; return s ? s.scrollWidth - s.clientWidth : 0; })() }));
  console.log(`5 ${w}x${hh}: page overflow ${o.sw - o.cw}px, hangar overflow ${o.screen}px, summary visible:`, await host.$eval(".hg-summary", (e) => getComputedStyle(e).display !== "none").catch(() => false));
  await host.screenshot({ path: `traces/hangar/4-launch-${w}.png` });
}
await host.setViewportSize({ width: 1024, height: 640 });
await host.click('.hg-steps button[data-step="Weapons"]');
await host.waitForTimeout(300);
await host.screenshot({ path: "traces/hangar/5-weapons-1024.png" });
await b.close();
