/** The main menu's tabs: Single player first (Create a match = a practice lobby); LAN/Online without a practice button. */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
console.log("tabs:", await p.$$eval(".tabs .tab", (e) => e.map((x) => `${x.textContent}${x.classList.contains("on") ? "*" : ""}`).join(" | ")));
await p.screenshot({ path: "traces/costs/4-menu-single.png" });
for (const m of ["lan", "online"]) {
  await p.click(`[data-mode="${m}"]`);
  await p.waitForTimeout(200);
  console.log(m, "practice button:", !!(await p.$("#practice")), "| create:", !!(await p.$("#create")));
}
await p.click('[data-mode="single"]');
await p.click("#practice");
await p.waitForSelector(".hg-step", { timeout: 15000 });
console.log("single player → practice lobby:", (await p.$$eval(".players .p", (e) => e.map((x) => x.textContent?.trim()).join(" / "))) ?? "");
await b.close();
