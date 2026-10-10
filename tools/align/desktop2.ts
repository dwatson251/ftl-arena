/** Two copies of the desktop app: A hosts, B types A's address and joins A's match; both ready → battle. */
import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const [dataA, dataB, portA] = process.argv.slice(2);
const open = async (data: string) => {
  const app = await electron.launch({ executablePath: require("electron"), args: ["--no-sandbox", "apps/desktop"], env: { ...process.env, FTL_ARENA_DATA: data } });
  const win = await app.firstWindow();
  await win.waitForURL(/localhost:\d+\//, { timeout: 30000 });
  await win.waitForSelector("#create:not([disabled])", { timeout: 60000 });
  await win.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  return { app, win };
};
const A = await open(dataA);
const B = await open(dataB);
console.log("A at", A.win.url(), "B at", B.win.url());
// B joins A's server by address.
await B.win.fill("#server", `localhost:${portA}`);
await B.win.click("#connect");
await B.win.waitForSelector("#create:not([disabled])", { timeout: 20000 });
console.log("B status:", await B.win.$eval(".menu", (m) => m.textContent?.match(/Connected to [^.]+/)?.[0] ?? "?"));
await A.win.fill("#name", "Host");
await A.win.click("#create");
await A.win.waitForSelector(".hg-step");
const code = (await A.win.$eval(".code", (e) => e.textContent ?? "")).trim();
console.log("A's match code:", code);
await B.win.fill("#name", "Friend");
await B.win.fill("#code", code);
await B.win.click("#join");
await B.win.waitForSelector(".hg-step", { timeout: 15000 });
for (const w of [A.win, B.win]) {
  await w.click('button[data-step="Launch"]');
  await w.waitForTimeout(300);
  await w.keyboard.press("Enter");
  await w.waitForTimeout(300);
  await w.keyboard.press("Enter").catch(() => {});
}
await A.win.waitForTimeout(2000);
await A.win.screenshot({ path: "traces/desktop/10-countdown.png" });
const inBattle = async (w: typeof A.win) => w.waitForFunction(() => !document.querySelector(".hg") && !!(window as any).__arena.view(), null, { timeout: 20000 }).then(() => true).catch(() => false);
console.log("battle started: A", await inBattle(A.win), "B", await inBattle(B.win));
await A.win.waitForTimeout(1500);
await A.win.screenshot({ path: "traces/desktop/11-battle-A.png" });
await B.win.screenshot({ path: "traces/desktop/11-battle-B.png" });
console.log("players:", await A.win.evaluate(() => (window as any).__arena.view().ships.map((s: any) => s.player)));
await A.app.close();
await B.app.close();
