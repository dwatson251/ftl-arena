/** Pausing check: the practice pause clock (Space) and a tactical timeout. Writes traces/pause/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/pause";
mkdirSync(out, { recursive: true });
type A = { view(): any };
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
const state = () => p.evaluate(() => {
  const v = (window as unknown as { __arena: A }).__arena.view();
  return { tick: v.tick, pause: v.pause, bank: v.pauseBank, next: v.nextTactical, mode: v.config.pause };
});
for (const mode of ["clock", "tactical"]) {
  await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
  await p.goto(URL);
  await p.waitForSelector("#practice:not([disabled])");
  await p.click('[data-open="single"]');
  await p.waitForSelector(".hg-step");
  await p.waitForTimeout(1200);
  if (mode === "tactical") {
    await p.selectOption('select[data-cfg="pause"]', "tactical");
    await p.waitForTimeout(500);
    await p.fill('input[data-cfg="tacticalEvery"]', "15");
    await p.press('input[data-cfg="tacticalEvery"]', "Enter");
    await p.waitForTimeout(500);
  }
  await p.screenshot({ path: `${out}/${mode}-rules.png` });
  await p.click('button[data-ship="PLAYER_SHIP_HARD"]');
  await p.click('button[data-step="Launch"]');
  await p.click(".hg-summary button[data-ready]");
  await p.waitForTimeout(300);
  await p.click(".hg-summary button[data-force]").catch(() => {});
  await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
  await p.waitForTimeout(3000);
  console.log(mode, "start", JSON.stringify(await state()));
  if (mode === "clock") {
    await p.keyboard.press("Space");
    await p.waitForTimeout(2500);
    const a = await state();
    await p.screenshot({ path: `${out}/clock-paused.png` });
    await p.waitForTimeout(1000);
    const b = await state();
    console.log("paused: tick", a.tick, "->", b.tick, JSON.stringify(b.pause));
    await p.keyboard.press("Space");
    await p.waitForTimeout(1000);
    console.log("resumed", JSON.stringify(await state()));
  } else {
    await p.waitForTimeout(10500);
    await p.screenshot({ path: `${out}/tactical-warning.png` });
    await p.waitForTimeout(2500);
    console.log("timeout", JSON.stringify(await state()));
    await p.screenshot({ path: `${out}/tactical-paused.png` });
    await p.keyboard.press("Space");
    await p.waitForTimeout(800);
    console.log("after ready", JSON.stringify(await state()));
  }
}
await browser.close();
