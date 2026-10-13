/** Loading screen and offline cache check: time to the first menu on a cold load and a warm one. traces/loading/. */
import { mkdirSync, rmSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/loading";
mkdirSync(out, { recursive: true });
const profile = `${out}/profile`;
rmSync(profile, { recursive: true, force: true });
for (const run of ["cold", "warm", "warm2"]) {
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 720 } });
  const p = ctx.pages()[0] ?? (await ctx.newPage());
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  const t0 = Date.now();
  await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
  await p.goto(URL);
  if (run === "cold") {
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/loading.png` });
  }
  await p.waitForSelector("#loading", { state: "detached", timeout: 120000 });
  const t = (Date.now() - t0) / 1000;
  const sw = await p.evaluate(async () => (await navigator.serviceWorker?.getRegistration())?.active?.state ?? "none");
  const cached = await p.evaluate(async () => ((await caches.open("ftl-arena-assets")).keys()).then((k) => k.length));
  console.log(`${run}: menu after ${t.toFixed(1)} s, service worker ${sw}, ${cached} assets cached`);
  if (run === "warm2") await p.screenshot({ path: `${out}/menu.png` });
  await ctx.close();
}
