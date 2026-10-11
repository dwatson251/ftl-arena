/** The Escape match menu: pauses when it may (practice), runs on behind it when it can't, and Quit leaves. */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
let loaded = false;
const start = async (pause: string) => {
  if (!loaded) {
    await p.goto(URL);
    await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
    loaded = true;
  }
  await p.click("#practice");
  await p.waitForSelector(".hg-step");
  await p.waitForTimeout(400);
  await p.selectOption('select[data-cfg="pause"]', pause);
  await p.waitForTimeout(400);
  await p.locator(".hg-step", { hasText: "Launch" }).click();
  await p.click('button[data-ready="1"]');
  const force = await p.waitForSelector('button[data-force="1"]', { timeout: 1500 }).catch(() => null);
  if (force) await force.click();
  await p.waitForFunction(() => !document.querySelector(".hg-step"), null, { timeout: 20000 });
  await p.waitForTimeout(1500);
};
const st = () => p.evaluate(() => { const v = (window as any).__arena.view(); return { menu: !!document.querySelector(".esc-menu"), paused: !!v?.pause, tick: v?.tick, note: document.querySelector(".esc-menu .note")?.textContent }; });
await start("clock");
await p.keyboard.press("Escape");
await p.waitForTimeout(700);
console.log("practice, Esc:", JSON.stringify(await st()));
await p.screenshot({ path: "traces/controller/6-escmenu.png" });
await p.keyboard.press("Escape");
await p.waitForTimeout(700);
console.log("Esc again:", JSON.stringify(await st()));
await p.keyboard.press("Escape");
await p.waitForTimeout(500);
console.log("menu open again:", JSON.stringify(await st()));
await p.click("#quit");
await p.waitForTimeout(1200);
await p.screenshot({ path: "traces/controller/7-after-quit.png" });
console.log("Quit → main menu:", !!(await p.$("#practice")), "| ui:", await p.evaluate(() => document.getElementById("ui")!.innerText.slice(0, 120).replace(/\s+/g, " ")));
await start("off");
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
const a = await st();
await p.waitForTimeout(1000);
const c = await st();
console.log("pausing off, Esc:", JSON.stringify(a), "→ a second later tick", c.tick);
await b.close();
