/**
 * Bring your own ship: a friend is mid-build; the host switches the rule (asked first); the friend is sent to
 * Presets with building steps, New ship and Launch locked; loading the FTL save opens Launch and Ready.
 * Usage: ARENA_URL=http://localhost:5180 npx tsx tools/align/ftlonly.ts <server host:port>
 */
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const addr = process.argv[2] ?? "localhost:8790";
const b = await chromium.launch();
const page = async (name: string) => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => console.log(name, "pageerror:", e.message));
  await p.goto(URL);
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  await p.evaluate(() => localStorage.removeItem("ftl-arena-presets"));
  await p.click('[data-mode="online"]');
  await p.fill("#name", name);
  await p.fill("#server", addr);
  return p;
};
const on = (p: Page) => p.$eval(".hg-step.on", (e) => e.textContent?.replace(/\d/g, "").trim());
const locked = (p: Page) => p.$$eval(".hg-step.locked", (es) => es.map((e) => e.textContent?.replace(/\d/g, "").trim()).join(" "));
const host = await page("Host");
await host.click("#create");
await host.waitForSelector(".hg-step");
const code = (await host.$eval(".code", (e) => e.textContent ?? "")).trim();
const friend = await page("Friend");
await friend.fill("#code", code);
await friend.click("#join");
await friend.waitForSelector(".hg-step");
await friend.click('.hg-steps button[data-step="Systems"]');
await friend.click('button[data-d="1"]:not(:disabled)');
await friend.waitForTimeout(500);
await host.selectOption('[data-cfg="ftlOnly"]', "1");
await host.waitForTimeout(300);
console.log("1 host asked first:", !!(await host.$("[data-ftlonly-yes]")), JSON.stringify(await host.$eval(".warnbox", (e) => e.textContent?.replace(/\s+/g, " ").trim()).catch(() => "")));
await host.screenshot({ path: "traces/ftlonly/1-host-confirm.png" });
await host.click("[data-ftlonly-yes]");
await friend.waitForTimeout(800);
console.log("2 friend now on:", await on(friend), "| locked:", await locked(friend), "| new ship disabled:", await friend.$eval("[data-preset-new]", (e) => (e as HTMLButtonElement).disabled), "| rules:", JSON.stringify(await friend.$eval(".rules-summary", (e) => e.textContent?.replace(/\s+/g, " ").trim())));
await friend.screenshot({ path: "traces/ftlonly/2-friend-presets.png" });
const card = await friend.waitForSelector("[data-ftl-load]", { timeout: 6000 }).catch(() => null);
if (card) {
  await friend.click("[data-ftl-load]");
  if (await friend.$("[data-ftl-yes]")) await friend.click("[data-ftl-yes]");
  await friend.waitForTimeout(800);
  console.log("3 after Load from FTL: on", await on(friend), "| locked:", await locked(friend) || "(none but builds)", "| ready enabled:", await friend.$eval('button[data-ready="1"]', (e) => !(e as HTMLButtonElement).disabled), "| back button:", await friend.$eval(".hg-nav button", (e) => e.textContent?.trim()));
  await friend.screenshot({ path: "traces/ftlonly/3-friend-launch.png" });
  await friend.click('button[data-ready="1"]');
  await friend.waitForTimeout(500);
  console.log("   friend ready on server:", JSON.stringify(await host.$$eval(".players .p", (es) => es.map((e) => e.textContent?.replace(/\s+/g, " ").trim()))));
} else console.log("3 no FTL save card on this machine");
// The host has no save-loaded ship yet: Launch is locked for them too.
await host.click('.hg-steps button[data-step="Presets"]');
await host.waitForTimeout(300);
console.log("4 host locked steps:", await locked(host));
await b.close();
