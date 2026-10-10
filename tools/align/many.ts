/** Many-systems check: a Kestrel with every system bought. Ion ring frames, HUD, and a UI teleport. traces/many/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/many";
mkdirSync(out, { recursive: true });
type A = { view(): any; send(c: unknown): void; ui(): any; toScreen(x: number, y: number): { x: number; y: number }; enemyRoom(r: number): { x: number; y: number } };
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("console:", m.text()); });
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(2000);
await p.fill('input[data-cfg="scrap"]', "5000");
await p.press('input[data-cfg="scrap"]', "Enter");
await p.waitForTimeout(800);
await p.click('button[data-ship="PLAYER_SHIP_HARD"]');
await p.click('button[data-step="Systems"]');
for (const id of ["drones", "teleporter", "cloaking", "hacking", "mind", "battery", "clonebay"]) {
  for (let i = 0; i < 2; i++) await p.click(`button[data-sys="${id}"][data-d="1"]`).catch(() => {});
}
for (let i = 0; i < 14; i++) await p.click('button[data-reactor="1"]').catch(() => {});
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/00-systems.png` });
await p.click('button[data-step="Launch"]');
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 }).catch(() => console.log("did not launch"));

await p.waitForTimeout(1500);
console.log("systems:", await p.evaluate(() => {
  const v = (window as unknown as { __arena: A }).__arena.view();
  const me = v.ships[v.you];
  return JSON.stringify(Object.values(me.systems).map((s: any) => `${s.id}:${s.power}/${s.level}`)) + " reactor " + me.reactor;
}));
await p.screenshot({ path: `${out}/01-hud.png` });
// Crew to the pad and power the teleporter.
await p.evaluate(() => {
  const a = (window as unknown as { __arena: A }).__arena;
  const v = a.view();
  const me = v.ships[v.you];
  a.send({ c: "moveCrew", crew: me.crew.slice(0, 2).map((c: any) => c.id), room: me.systems.teleporter.room });
  for (let i = 0; i < 3; i++) a.send({ c: "power", system: "teleporter", delta: 1 });
});
await p.waitForTimeout(20000);
const st = await p.evaluate(() => { const a = (window as unknown as { __arena: A }).__arena; const v = a.view(); const me = v.ships[v.you]; return { tele: me.tele, tp: me.systems.teleporter, ui: a.ui() }; });
console.log("tele state:", JSON.stringify(st));
await p.screenshot({ path: `${out}/02-charged.png` });
if (st.ui?.tele?.length) {
  const b = st.ui.tele[0].box;
  const s = await p.evaluate(([x, y]) => (window as unknown as { __arena: A }).__arena.toScreen(x, y), [b.x + 16, b.y + 16]);
  await p.mouse.click(s.x, s.y);
  await p.waitForTimeout(300);
  const t = await p.evaluate(() => { const a = (window as unknown as { __arena: A }).__arena; const v = a.view(); const en = v.ships[1 - v.you]; return a.enemyRoom((en.systems.weapons ?? en.systems.shields).room); });
  await p.mouse.click(t.x, t.y);
  await p.waitForTimeout(1500);
}
console.log("after:", await p.evaluate(() => { const v = (window as unknown as { __arena: A }).__arena.view(); return v.ships.map((s: any) => s.crew.filter((c: any) => c.owner === v.you).length); }));
// Ion ring frames.
await p.click('#debug [data-op="ion"][data-who="me"]');
const a0 = await p.evaluate(() => (window as unknown as { __arena: A }).__arena.toScreen(40, 640));
const a1 = await p.evaluate(() => (window as unknown as { __arena: A }).__arena.toScreen(420, 715));
for (let i = 0; i < 8; i++) {
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/ion-${i}.png`, clip: { x: a0.x, y: a0.y, width: a1.x - a0.x, height: a1.y - a0.y } });
}
await browser.close();
