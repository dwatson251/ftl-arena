/**
 * Round 13 visual check: FTL's system row (buttons beside their systems, trays inline), the cloak / hacking /
 * battery buttons and their timers, the hacking drone outside the hull with its lightning, the drone parts box.
 * Writes traces/round13/. Usage: ARENA_URL=http://localhost:5180 npx tsx tools/align/round13.ts [A|B]
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const variant = process.argv[2] ?? "A";
const out = `traces/round13/${variant}`;
mkdirSync(out, { recursive: true });
type A = { view(): any; send(c: unknown): void; ui(): any; toScreen(x: number, y: number): { x: number; y: number }; enemyRoom(r: number): { x: number; y: number } };
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
p.on("console", (m) => {
  if (m.type() === "error") console.log("console:", m.text());
});
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(1500);
await p.fill('input[data-cfg="scrap"]', "5000");
await p.press('input[data-cfg="scrap"]', "Enter");
await p.waitForTimeout(600);
await p.click('button[data-ship="PLAYER_SHIP_HARD"]');
await p.click('button[data-step="Systems"]');
const press = (sel: string) => p.$eval(sel, (b) => (b as HTMLButtonElement).click()).catch(() => {});
const buy = variant === "A" ? ["teleporter", "cloaking", "hacking", "battery"] : ["drones", "mind", "clonebay", "battery"];
for (const id of buy) for (let i = 0; i < 2; i++) await press(`button[data-sys="${id}"][data-d="1"]`);
for (let i = 0; i < 14; i++) await press('button[data-reactor="1"]');
if (variant === "B") {
  await p.click('button[data-step="Drones"]');
  await p.waitForTimeout(300);
  await press('button[data-drone="COMBAT_1"]');
  await press('button[data-drone="DEFENSE_1"]');
  for (let i = 0; i < 4; i++) await press('button[data-parts="1"]');
}
await p.waitForTimeout(300);
await p.click('button[data-step="Launch"]');
await p.click(".hg-summary button[data-ready]");
await p.waitForTimeout(300);
await p.click(".hg-summary button[data-force]").catch(() => {});
await p.waitForFunction(() => !document.querySelector(".hg"), null, { timeout: 15000 }).catch(() => console.log("did not launch"));
await p.waitForTimeout(1500);
const arena = () => p.evaluate(() => {
  const a = (window as unknown as { __arena: A }).__arena;
  const v = a.view();
  const me = v.ships[v.you];
  return { sys: Object.values(me.systems).map((s: any) => `${s.id}:${s.power}/${s.level}`).join(" "), ui: a.ui(), parts: me.droneParts, hack: me.hack, cloak: me.cloak, battery: me.battery };
});
console.log("start", JSON.stringify(await arena()));
await p.screenshot({ path: `${out}/01-hud.png` });
const clickBox = async (b: { x: number; y: number; w: number; h: number }) => {
  const s = await p.evaluate(([x, y]) => (window as unknown as { __arena: A }).__arena.toScreen(x, y), [b.x + b.w / 2, b.y + b.h / 2]);
  await p.mouse.click(s.x, s.y);
};
if (variant === "A") {
  // Power everything up.
  await p.evaluate(() => {
    const a = (window as unknown as { __arena: A }).__arena;
    for (const id of ["cloaking", "hacking", "teleporter"]) for (let i = 0; i < 2; i++) a.send({ c: "power", system: id, delta: 1 });
  });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/02-powered.png` });
  // Cloak through its button.
  let st = await arena();
  const btns = st.ui.btns as { box: any; ok: boolean; why?: string }[];
  console.log("buttons", JSON.stringify(btns));
  const cloakBtn = btns.find((b) => b.ok && b.box.h >= 23 && b.box.x < 600);
  await p.evaluate(() => (window as unknown as { __arena: A }).__arena.send({ c: "cloak" }));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/03-cloaked.png` });
  void cloakBtn;
  // Hack the enemy weapons.
  await p.evaluate(() => {
    const a = (window as unknown as { __arena: A }).__arena;
    const v = a.view();
    const en = v.ships[1 - v.you];
    a.send({ c: "hackLaunch", room: (en.systems.weapons ?? en.systems.shields).room });
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/04-hack-flying.png` });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/05-hack-landed.png` });
  await p.evaluate(() => (window as unknown as { __arena: A }).__arena.send({ c: "hackPulse" }));
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/06-hack-pulse.png` });
  await p.evaluate(() => (window as unknown as { __arena: A }).__arena.send({ c: "battery" }));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/07-battery.png` });
  st = await arena();
  console.log("after", JSON.stringify({ hack: st.hack, cloak: st.cloak, battery: st.battery }));
} else {
  await p.evaluate(() => {
    const a = (window as unknown as { __arena: A }).__arena;
    for (let i = 0; i < 2; i++) a.send({ c: "power", system: "mind", delta: 1 });
    a.send({ c: "dronePower", slot: 0, on: true });
    a.send({ c: "dronePower", slot: 1, on: true });
  });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${out}/02-drones.png` });
  await p.evaluate(() => (window as unknown as { __arena: A }).__arena.send({ c: "dronePower", slot: 0, on: false }));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/03-drone-offline.png` });
  // Kill a crew member: the clone bay queue.
  await p.click('#debug [data-op="kill"][data-who="me"]');
  await p.waitForTimeout(400);
  await p.click('#debug [data-op="kill"][data-who="me"]');
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${out}/04-clone-queue.png` });
  await p.waitForTimeout(9000);
  await p.screenshot({ path: `${out}/05-clone-arrive.png` });
  console.log("state", JSON.stringify(await arena()));
}
await browser.close();
