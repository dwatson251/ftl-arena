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
  await p.click('[data-open="single"]');
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
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
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
const opened = await on(p);
await tab("Presets"); // a host starts on Rules, then their presets
await p.waitForTimeout(400);
console.log("3 next lobby opens on:", opened, "→ Presets", "cards:", await p.$$eval(".preset-card:not(.preset-new-card)", (es) => es.map((e) => e.querySelector(".pc-name")?.textContent + " | " + e.querySelector(".pc-ship")?.textContent + " | " + e.querySelector(".pc-cost")?.textContent?.replace(/\s+/g, " ").trim())));
await p.screenshot({ path: "traces/presets/1-presets.png" });
await p.click(".preset-pick");
await p.waitForTimeout(400);
console.log("4 picked → step:", await on(p), "save box shown:", !!(await p.$(".save-box")), "note:", await p.$eval(".save-note", (e) => e.textContent?.trim()).catch(() => ""));
await bump();
await tab("Launch");
console.log("5 after a change, default name:", await p.$eval("[data-preset-name]", (e) => (e as HTMLInputElement).value));
await p.screenshot({ path: "traces/presets/2-launch-copy.png" });
// "New ship" with unsaved changes asks first; Keep leaves everything; Discard starts over with no preset.
const summary = async () => {
  await tab("Systems");
  return `pilot ${await p.$eval('[data-sys="pilot"][data-d="1"]', (b) => b.closest(".sys-row")!.querySelectorAll(".bars i.on, .bars i.new").length)}`;
};
const before = await summary();
await tab("Presets");
await p.click("[data-preset-new]");
await p.waitForTimeout(200);
console.log("5b new ship (changed): asks:", !!(await p.$(".preset-new-card .preset-confirm")));
await p.screenshot({ path: "traces/presets/5-new-confirm.png" });
await p.click("[data-preset-new-no]");
await p.waitForTimeout(200);
const keptOn = await on(p);
console.log("   Keep → still on:", keptOn, "build kept:", (await summary()) === before);
await tab("Presets");
await p.click("[data-preset-new]");
await p.click("[data-preset-new-yes]");
await p.waitForTimeout(400);
const discardOn = await on(p);
console.log("   Discard → on:", discardOn, "build reset:", await summary(), "(was", before + ")");
await tab("Launch");
console.log("   preset cleared: save box default:", await p.$eval("[data-preset-name]", (e) => (e as HTMLInputElement).value));
// An unchanged preset: New ship resets straight away.
await tab("Presets");
await p.click(".preset-pick");
await p.waitForTimeout(300);
await tab("Presets");
await p.click("[data-preset-new]");
await p.waitForTimeout(300);
console.log("5c new ship (unchanged preset): asked:", !!(await p.$(".preset-confirm")), "on:", await on(p));
await tab("Rules");
await p.fill('[data-cfg="scrap"]', "10");
await p.dispatchEvent('[data-cfg="scrap"]', "change");
await p.waitForTimeout(500);
await tab("Presets");
console.log("6 low budget: warn:", await p.$eval(".preset-card:not(.preset-new-card)", (e) => e.classList.contains("warn")), JSON.stringify(await p.$eval(".pc-warn", (e) => e.textContent).catch(() => "")), "pickable:", await p.$eval(".preset-pick", (e) => !(e as HTMLButtonElement).disabled));
await p.screenshot({ path: "traces/presets/3-over-budget.png" });
await p.click(".preset-del");
await p.waitForTimeout(200);
console.log("7 confirm shown:", !!(await p.$(".preset-confirm")));
await p.screenshot({ path: "traces/presets/4-delete-confirm.png" });
await p.click("[data-preset-del-no]");
await p.waitForTimeout(200);
console.log("  after Keep, cards:", (await p.$$(".preset-card:not(.preset-new-card)")).length);
await p.click(".preset-del");
await p.click("[data-preset-del-yes]");
await p.waitForTimeout(200);
console.log("  after Delete, cards:", (await p.$$(".preset-card:not(.preset-new-card)")).length, "stored:", await p.evaluate(() => JSON.parse(localStorage.getItem("ftl-arena-presets") ?? "[]").length));
// Load from FTL: the card shows this machine's run; with unsaved changes it asks first; it lands on Launch
// with the import notes, not saved.
await bump();
await tab("Presets");
const ftlCard = await p.waitForSelector("[data-ftl-load]", { timeout: 5000 }).catch(() => null);
console.log("8 FTL card:", ftlCard ? JSON.stringify((await ftlCard.textContent())?.replace(/\s+/g, " ").trim()) : "absent");
if (ftlCard) {
  await p.screenshot({ path: "traces/presets/7-ftl-card.png" });
  await p.click("[data-ftl-load]");
  await p.waitForTimeout(200);
  console.log("  asks first (changed build):", !!(await p.$("[data-ftl-yes]")));
  await p.click("[data-ftl-yes]");
  await p.waitForTimeout(500);
  console.log("  → on:", await on(p), "notes:", JSON.stringify(await p.$eval(".import-notes", (e) => e.textContent?.replace(/\s+/g, " ").trim()).catch(() => "")));
  console.log("  launch shows:", JSON.stringify(await p.$eval(".launch-grid", (e) => e.textContent?.replace(/\s+/g, " ").slice(0, 400))));
  console.log("  save box default:", await p.$eval("[data-preset-name]", (e) => (e as HTMLInputElement).value), "stored presets:", await p.evaluate(() => JSON.parse(localStorage.getItem("ftl-arena-presets") ?? "[]").length));
  await p.screenshot({ path: "traces/presets/8-ftl-launch.png" });
  await tab("Crew");
  await p.screenshot({ path: "traces/presets/9-ftl-crew.png" });
}
await b.close();
