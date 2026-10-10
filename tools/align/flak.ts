/** Flak art and debug buttons check. traces/flak/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/flak";
mkdirSync(out, { recursive: true });
type A = { view(): any; send(c: unknown): void };
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(1200);
await p.fill('input[data-cfg="scrap"]', "2000");
await p.press('input[data-cfg="scrap"]', "Enter");
await p.waitForTimeout(500);
await p.click('button[data-ship="PLAYER_SHIP_HARD"]');
await p.click('button[data-step="Weapons"]');
await p.waitForTimeout(300);
await p.$eval('button[data-buy="SHOTGUN_PLAYER"]', (b) => (b as HTMLButtonElement).click());
await p.waitForTimeout(300);
await p.click('button[data-step="Launch"]');
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.waitForTimeout(800);
const st = () => p.evaluate(() => { const v = (window as unknown as { __arena: A }).__arena.view(); const me = v.ships[v.you]; return { missiles: me.missiles, parts: me.droneParts, weapons: me.weapons.map((w: any) => w.bp) }; });
console.log("start", JSON.stringify(await st()));
await p.click('#debug [data-op="missiles"][data-who="me"]');
await p.click('#debug [data-op="parts"][data-who="me"]');
await p.click('#debug [data-op="damage"][data-who="me"]');
await p.click('#debug [data-op="ion"][data-who="me"]');
await p.waitForTimeout(400);
console.log("after +5s", JSON.stringify(await st()));
await p.click('#debug [data-op="fixall"][data-who="me"]');
await p.waitForTimeout(400);
console.log("after fix all", await p.evaluate(() => { const v = (window as unknown as { __arena: A }).__arena.view(); return JSON.stringify(Object.values(v.ships[v.you].systems).filter((s: any) => s.damage || s.ion).map((s: any) => s.id)); }));
// Power the flak and fire it at the enemy shields.
await p.evaluate(() => {
  const a = (window as unknown as { __arena: A }).__arena;
  const v = a.view();
  const me = v.ships[v.you];
  const slot = me.weapons.findIndex((w: any) => w.bp === "SHOTGUN_PLAYER");
  me.weapons.forEach((_: unknown, i: number) => i !== slot && a.send({ c: "weaponPower", slot: i, on: false }));
  a.send({ c: "weaponPower", slot, on: true });
  a.send({ c: "autofire", slot, on: true });
  a.send({ c: "target", slot, target: { kind: "room", room: v.ships[1 - v.you].systems.shields.room } });
});
for (let i = 0; i < 120; i++) {
  await p.waitForTimeout(250);
  const flying = await p.evaluate(() => (window as unknown as { __arena: A }).__arena.view().projectiles.some((q: any) => q.kind === "BURST" && q.t > 0.15));
  if (flying) {
    await p.screenshot({ path: `${out}/flak.png` });
    console.log("captured flak in flight");
    break;
  }
}
await browser.close();
