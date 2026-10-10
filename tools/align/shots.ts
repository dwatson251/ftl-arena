/**
 * Boarder shooting check: two Mantis boarders teleported onto a bot's ship (god mode on both, so the fight
 * lasts). Captures a burst of frames of the enemy window and counts small-arms sounds. traces/shots/.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/shots";
mkdirSync(out, { recursive: true });
type A = { view(): any; send(c: unknown): void; enemyRoom(r: number): { x: number; y: number } };
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 3 })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
// Count every sound effect started.
await p.addInitScript(() => {
  const orig = HTMLMediaElement.prototype.play;
  (window as unknown as { __plays: number }).__plays = 0;
  HTMLMediaElement.prototype.play = function () {
    (window as unknown as { __plays: number }).__plays++;
    return orig.call(this);
  };
});
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector(".hg-step");
await p.waitForTimeout(1500);
// A fixed opponent (a random one may carry a Zoltan shield, which blocks teleporting).
await p.selectOption('select[data-prac="botShip"]', "PLAYER_SHIP_HARD");
await p.waitForTimeout(800);
await p.click('button[data-ship="PLAYER_SHIP_MANTIS"]');
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
  a.send({ c: "moveCrew", crew: me.crew.filter((c: any) => c.owner === v.you).slice(0, 2).map((c: any) => c.id), room: me.systems.teleporter.room });
  a.send({ c: "power", system: "medbay", delta: -1 });
  a.send({ c: "power", system: "teleporter", delta: 1 });
});
await p.waitForTimeout(21000);
console.log("before teleport", await p.evaluate(() => {
  const v = (window as unknown as { __arena: A }).__arena.view();
  const me = v.ships[v.you];
  return JSON.stringify({ tele: me.tele, tp: me.systems.teleporter, crew: me.crew.map((c: any) => `${c.tile}:${c.path.length}`), shield: v.ships[1 - v.you].superShield });
}));
await p.evaluate(() => {
  const a = (window as unknown as { __arena: A }).__arena;
  const v = a.view();
  const en = v.ships[1 - v.you];
  a.send({ c: "teleport", room: (en.systems.oxygen ?? en.systems.weapons).room });
});
await p.waitForTimeout(4000);
console.log("after teleport", await p.evaluate(() => {
  const v = (window as unknown as { __arena: A }).__arena.view();
  return JSON.stringify(v.ships.map((s: any) => s.crew.map((c: any) => `${c.owner}:${c.tile}:${c.task}:${c.beam ? "beam" : ""}`)));
}));
const before = await p.evaluate(() => (window as unknown as { __plays: number }).__plays);
const at = await p.evaluate(() => {
  const a = (window as unknown as { __arena: A }).__arena;
  const v = a.view();
  const en = v.ships[1 - v.you];
  return a.enemyRoom((en.systems.oxygen ?? en.systems.weapons).room);
});
for (let i = 0; i < 12; i++) {
  await p.screenshot({ path: `${out}/f${i}.png`, clip: { x: at.x - 45, y: at.y - 30, width: 90, height: 60 } });
  await p.waitForTimeout(120);
}
await p.waitForTimeout(3000);
const after = await p.evaluate(() => (window as unknown as { __plays: number }).__plays);
console.log("sounds started in ~4 s:", after - before);
console.log(await p.evaluate(() => {
  const v = (window as unknown as { __arena: A }).__arena.view();
  const en = v.ships[1 - v.you];
  return JSON.stringify(en.crew.map((c: any) => `${c.owner === v.you ? "mine" : "theirs"}:${c.task}${c.punch ? "/punch" : ""}:${c.face ?? ""}`));
}));
await browser.close();
