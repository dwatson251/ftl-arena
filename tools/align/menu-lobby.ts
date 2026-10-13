/**
 * The FTL-style main menu and the lobby (traces/menu-lobby/): first-launch name prompt, the title screen,
 * each mode's panel and Back; the lobby with no sidebar (host and a joined player), the code's share popover,
 * no chat (it's battle only), and the build steps over the hangar art.  Usage: ARENA_URL=<vite dev> npx tsx tools/align/menu-lobby.ts
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const out = "traces/menu-lobby";
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const page = async (fresh: boolean): Promise<Page> => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  if (!fresh) await p.addInitScript(() => localStorage.setItem("ftl-arena-name", "Ann"));
  await p.goto(URL);
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  await p.waitForTimeout(500);
  return p;
};
const shot = (p: Page, n: string) => p.screenshot({ path: `${out}/${n}.png` });
// First launch: the name prompt.
const f = await page(true);
console.log("name prompt:", !!(await f.$("#firstname")));
await shot(f, "0-first-launch");
await f.fill("#firstname", "Bea");
await f.press("#firstname", "Enter");
await f.waitForTimeout(300);
await shot(f, "1-title");
for (const m of ["lan", "online", "settings"]) {
  await f.click(`[data-open="${m}"]`);
  await f.waitForTimeout(300);
  await shot(f, `2-${m}`);
  await f.click("[data-back]");
  await f.waitForTimeout(200);
}
console.log("back on the title screen:", !!(await f.$(".mm-btn")) && !(await f.$(".mm-panel")));
await f.close();

// The lobby: a host on LAN, and a second player who joins (no sidebar; Rules read-only for them).
const host = await page(false);
await host.click('[data-open="lan"]');
await host.click("#create");
await host.waitForSelector(".hg-step");
await host.waitForTimeout(800);
const code = (await host.$eval(".lobby-code", (e) => e.textContent ?? "")).trim();
await shot(host, "3-host-rules");
await host.click("[data-invite]");
await host.waitForTimeout(500);
await shot(host, "4-invite");
await host.click("[data-invite]");
const guest = await page(false);
await guest.click('[data-open="lan"]');
await guest.fill("#code", code);
await guest.click("#join");
await guest.waitForSelector(".hg-step");
await guest.waitForTimeout(800);
await guest.click('button[data-step="Rules"]');
await guest.waitForTimeout(400);
console.log("guest rules inputs:", await guest.$$eval(".hg-main input, .hg-main select", (es) => es.length), "| chips:", await guest.$$eval(".pchip", (es) => es.map((e) => e.textContent?.trim()).join(" / ")));
await shot(guest, "5-guest-rules");
for (const st of ["Presets", "Ship", "Systems", "Weapons", "Crew", "Launch"]) {
  await host.click(`button[data-step="${st}"]`);
  await host.waitForTimeout(600);
  await shot(host, `6-${st.toLowerCase()}`);
}
console.log("chat in the lobby:", await host.$eval("#chat", (e) => getComputedStyle(e).display));
await b.close();
