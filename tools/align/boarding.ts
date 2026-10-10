/** Boarding visual check: Mantis Cruiser (teleporter) vs a Kestrel bot. ARENA_URL; screenshots in traces/boarding/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/boarding";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(2500);
await p.click('button[data-ship="PLAYER_SHIP_MANTIS"]');
await p.click('button[data-step="Launch"]');
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 });
await p.evaluate(() => document.querySelector<HTMLButtonElement>("#debug button[data-toggle]")?.click());
await p.waitForTimeout(500);
type A = { view(): any; send(c: unknown): void; ui(): any; toScreen(x: number, y: number): { x: number; y: number } };
const A = "(window as any).__arena";
// Two crew onto the teleporter pad.
await p.evaluate(() => {
  const a = (window as unknown as { __arena: A }).__arena;
  const v = a.view();
  const me = v.ships[v.you];
  const ids = me.crew.filter((c: any) => c.owner === v.you).slice(0, 2).map((c: any) => c.id);
  a.send({ c: "moveCrew", crew: ids, room: me.systems.teleporter.room });
  // The reactor runs out before the teleporter: take the medbay's bar.
  a.send({ c: "power", system: "medbay", delta: -1 });
  a.send({ c: "power", system: "teleporter", delta: 1 });
});
void A;
await p.waitForTimeout(22000);
await p.screenshot({ path: `${out}/01-charged.png` });
const tele = await p.evaluate(() => (window as unknown as { __arena: A }).__arena.ui()?.tele);
console.log("tele buttons:", JSON.stringify(tele));
if (tele?.length) {
  const b = tele[0].box;
  const s = await p.evaluate(([x, y]) => (window as unknown as { __arena: A }).__arena.toScreen(x, y), [b.x + 16, b.y + 16]);
  await p.mouse.click(s.x, s.y);
  await p.waitForTimeout(200);
  // Click the middle of the enemy window (a room near the centre of the enemy ship).
  const t = await p.evaluate(() => {
    const a = (window as unknown as { __arena: A & { enemyRoom(r: number): { x: number; y: number } } }).__arena;
    const v = a.view();
    const en = v.ships[1 - v.you];
    return a.enemyRoom((en.systems.weapons ?? en.systems.shields).room);
  });
  await p.mouse.click(t.x, t.y);
}
await p.waitForTimeout(9000);
await p.screenshot({ path: `${out}/02-boarded.png` });
console.log(await p.evaluate(() => {
  const v = (window as unknown as { __arena: A }).__arena.view();
  return JSON.stringify(v.ships.map((s: any) => ({ aboard: s.crew.map((c: any) => `${c.owner}:${c.race}:${Math.round(c.hp)}:${c.task}`), sys: Object.values(s.systems).filter((x: any) => x.damage).map((x: any) => `${x.id}-${x.damage}`) })));
}));
await p.waitForTimeout(15000);
await p.screenshot({ path: `${out}/03-later.png` });
await browser.close();
