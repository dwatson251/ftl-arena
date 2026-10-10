/**
 * Presets end to end (one browser, practice lobbies): fresh store opens on Ship; save from Launch; next
 * lobby opens on Presets with the card; pick → Launch with no save offer; change → "<name> - Copy";
 * over-budget warning; delete with Keep / Delete.   Usage: ARENA_URL=http://localhost:5180 npx tsx tools/align/presets.ts
 */
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.setDefaultTimeout(15000);
p.on("pageerror", (e) => console.log("pageerror:", e.message));
const on = (pg: Page) => pg.$eval(".hg-step.on", (e) => e.textContent?.replace(/\d/g, "").trim());
const practice = async () => {
  await p.click("#practice");
  await p.waitForSelector(".hg-step");
  await p.waitForTimeout(400);
};
const tab = async (s: string) => {
  await p.click(`.hg-steps button[data-step="${s}"]`);
  await p.waitForTimeout(250);
};
const bump = async () => {
  await tab("Systems");
  await p.click('button[data-d="1"]:not(:disabled)');
  await p.waitForTimeout(250);
};
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.evaluate(() => localStorage.removeItem("ftl-arena-presets"));
await p.reload();
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await practice();
console.log("1 fresh store opens on:", await on(p));
await bump();
await tab("Launch");
console.log("2 save box default name:", await p.$eval("[data-preset-name]", (e) => (e as HTMLInputElement).value));
await p.fill("[data-preset-name]", "Rush");
await p.click("[data-preset-save]");
await p.waitForTimeout(300);
console.log("  after save:", await p.$eval(".save-note", (e) => e.textContent?.trim()), "box gone:", !(await p.$(".save-box")));
await p.click("[data-leave]");
await p.waitForSelector("#practice");
await practice();
await p.waitForTimeout(600);
console.log("3 next lobby opens on:", await on(p), "cards:", await p.$$eval(".preset-card", (es) => es.map((e) => e.querySelector(".pc-name")?.textContent + " | " + e.querySelector(".pc-ship")?.textContent + " | " + e.querySelector(".pc-cost")?.textContent?.replace(/\s+/g, " ").trim())));
await p.screenshot({ path: "traces/presets/1-presets.png" });
await p.click(".preset-pick");
await p.waitForTimeout(400);
console.log("4 picked → step:", await on(p), "save box shown:", !!(await p.$(".save-box")), "note:", await p.$eval(".save-note", (e) => e.textContent?.trim()).catch(() => ""));
await bump();
await tab("Launch");
console.log("5 after a change, default name:", await p.$eval("[data-preset-name]", (e) => (e as HTMLInputElement).value));
await p.screenshot({ path: "traces/presets/2-launch-copy.png" });
await p.fill('[data-cfg="scrap"]', "10");
await p.dispatchEvent('[data-cfg="scrap"]', "change");
await p.waitForTimeout(500);
await tab("Presets");
console.log("6 low budget: warn:", await p.$eval(".preset-card", (e) => e.classList.contains("warn")), JSON.stringify(await p.$eval(".pc-warn", (e) => e.textContent).catch(() => "")), "pickable:", await p.$eval(".preset-pick", (e) => !(e as HTMLButtonElement).disabled));
await p.screenshot({ path: "traces/presets/3-over-budget.png" });
await p.click(".preset-del");
await p.waitForTimeout(200);
console.log("7 confirm shown:", !!(await p.$(".preset-confirm")));
await p.screenshot({ path: "traces/presets/4-delete-confirm.png" });
await p.click("[data-preset-del-no]");
await p.waitForTimeout(200);
console.log("  after Keep, cards:", (await p.$$(".preset-card")).length);
await p.click(".preset-del");
await p.click("[data-preset-del-yes]");
await p.waitForTimeout(200);
console.log("  after Delete, cards:", (await p.$$(".preset-card")).length, "stored:", await p.evaluate(() => JSON.parse(localStorage.getItem("ftl-arena-presets") ?? "[]").length));
await b.close();
