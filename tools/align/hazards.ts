/** Hazard check: each hazard's scenery and HUD line, plus a flare / pulse / asteroids in action. traces/hazards/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/hazards";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const hz of ["sun", "pulsar", "asteroids", "storm", "asb"]) {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => console.log(hz, "pageerror:", e.message));
  await p.goto(URL);
  await p.waitForSelector("#practice:not([disabled])");
  await p.click("#practice");
  await p.waitForSelector(".hg-step");
  await p.waitForTimeout(1000);
  await p.selectOption('select[data-cfg="hazard"]', hz);
  await p.waitForTimeout(400);
  await p.click('button[data-step="Launch"]');
  await p.click(".hg-summary button[data-ready]");
  await p.waitForTimeout(300);
  await p.click(".hg-summary button[data-force]").catch(() => {});
  await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
  await p.click('#debug [data-op="god"]').catch(() => {});
  // Wait for the hazard to act (flare/pulse within ~35 s, rocks in waves).
  let shot = false;
  for (let i = 0; i < 160 && !shot; i++) {
    await p.waitForTimeout(250);
    const st = await p.evaluate(() => { const v = (window as any).__arena.view(); return { next: v.hazard?.next, rocks: v.projectiles.filter((q: any) => q.hazard).length }; });
    if ((hz === "sun" || hz === "pulsar") && st.next > 25) shot = true;
    if ((hz === "asteroids" || hz === "asb") && st.rocks > 0) shot = true;
    if (hz === "storm" && i > 8) shot = true;
  }
  await p.waitForTimeout(hz === "asteroids" || hz === "asb" ? 900 : 120);
  await p.screenshot({ path: `${out}/${hz}.png` });
  console.log(hz, "captured", shot);
  await p.context().close();
}
await browser.close();
