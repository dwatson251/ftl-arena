/** Desktop app check (Electron): first-run setup → extract → the game; then the host window. traces/desktop/. */
import { _electron as electron } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const data = process.argv[2];
const ftl = process.argv[3];
const app = await electron.launch({ executablePath: require("electron"), args: ["--no-sandbox", "apps/desktop"], env: { ...process.env, FTL_ARENA_DATA: data } });
const win = await app.firstWindow();
await win.waitForLoadState();
await win.waitForTimeout(1500);
console.log("first page:", win.url().replace(/.*\//, ""));
await win.screenshot({ path: "traces/desktop/01-setup.png" });
if (win.url().endsWith("setup.html")) {
  const r = win.evaluate((f) => (window as any).ftlArena.extract(f), ftl);
  await win.waitForTimeout(1200);
  await win.screenshot({ path: "traces/desktop/02-extracting.png" });
  console.log("extract:", JSON.stringify(await r));
}
await win.waitForURL(/localhost:\d+\//, { timeout: 30000 });
console.log("game at", win.url());
await win.waitForSelector("#practice:not([disabled])", { timeout: 60000 });
await win.waitForTimeout(800);
await win.screenshot({ path: "traces/desktop/03-menu.png" });
await win.click('[data-open="single"]');
await win.waitForSelector(".hg-step", { timeout: 20000 });
await win.waitForTimeout(800);
await win.screenshot({ path: "traces/desktop/04-hangar.png" });
await app.close();
