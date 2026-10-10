/** Flagship check: its guns on their mounts, beams, the jump away at stage end. traces/flagship/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/flagship";
mkdirSync(out, { recursive: true });
type A = { view(): any; send(c: unknown): void };
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(1200);
await p.selectOption('select[data-prac="botShip"]', "BOSS_1");
await p.waitForTimeout(600);
await p.fill('input[data-cfg="scrap"]', "3000");
await p.press('input[data-cfg="scrap"]', "Enter");
await p.waitForTimeout(400);
await p.click('button[data-ship="PLAYER_SHIP_HARD"]');
await p.click('button[data-step="Weapons"]');
await p.waitForTimeout(300);
await p.$eval('button[data-buy="BEAM_1"]', (b) => (b as HTMLButtonElement).click()).catch(() => console.log("no BEAM_1 buy"));
await p.click('button[data-step="Launch"]');
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.click('#debug [data-op="god"]').catch(() => {});
await p.evaluate(() => {
  const a = (window as unknown as { __arena: A }).__arena;
  const v = a.view();
  const me = v.ships[v.you];
  const slot = me.weapons.findIndex((w: any) => w.bp === "BEAM_1");
  me.weapons.forEach((_: unknown, i: number) => i !== slot && a.send({ c: "weaponPower", slot: i, on: false }));
  a.send({ c: "weaponPower", slot, on: true });
  a.send({ c: "autofire", slot, on: true });
  const en = v.ships[1 - v.you];
  a.send({ c: "target", slot, target: { kind: "beam", x1: 100, y1: 150, x2: 250, y2: 150 } });
  void en;
});
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/01-flagship.png` });
let shots = 0;
for (let i = 0; i < 200 && shots < 3; i++) {
  await p.waitForTimeout(150);
  const beam = await p.evaluate(() => (window as unknown as { __arena: A }).__arena.view().projectiles.find((q: any) => q.kind === "BEAM" && q.t > 0.2));
  if (beam) await p.screenshot({ path: `${out}/beam${shots++}.png` });
}
console.log("beam frames:", shots);
for (let i = 0; i < 6; i++) await p.click('#debug [data-op="hull"][data-who="them"]');
for (let i = 0; i < 8; i++) {
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/jump${i}.png` });
}
await browser.close();
