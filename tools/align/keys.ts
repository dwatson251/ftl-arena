/** Builder shortcuts check: Enter/Tab forward, Backspace/Escape back, Enter readies, Escape unreadies and stops the countdown. */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(1200);
const step = () => p.$eval(".hg-step.on", (b) => b.textContent?.trim());
const status = () => p.evaluate(() => ({ step: document.querySelector(".hg-step.on")?.textContent?.trim(), countdown: document.body.innerText.match(/Launch in \d+/)?.[0] ?? "", ready: document.querySelector('button[data-ready="0"]') ? "ready" : "not ready" }));
// Enter in the scrap box submits and defocuses (and doesn't change page).
await p.fill('input[data-cfg="scrap"]', "9000");
await p.press('input[data-cfg="scrap"]', "Enter");
await p.waitForTimeout(500);
console.log("after Enter in scrap:", await step(), "focused:", await p.evaluate(() => document.activeElement?.tagName), "scrap:", await p.inputValue('input[data-cfg="scrap"]'));
await p.keyboard.press("Enter");
await p.waitForTimeout(200);
console.log("Enter:", await step());
await p.keyboard.press("Tab");
await p.waitForTimeout(200);
console.log("Tab:", await step());
await p.keyboard.press("Backspace");
await p.waitForTimeout(200);
console.log("Backspace:", await step());
await p.keyboard.press("Shift+Tab");
await p.waitForTimeout(200);
console.log("Shift+Tab:", await step());
for (let i = 0; i < 7; i++) await p.keyboard.press("Tab");
await p.waitForTimeout(200);
console.log("Tab x7:", JSON.stringify(await status()));
await p.keyboard.press("Enter");
await p.waitForTimeout(400);
if ((await status()).ready === "not ready") {
  // A launch warning: Enter again is "Ready anyway".
  await p.keyboard.press("Enter");
  await p.waitForTimeout(400);
}
console.log("Enter (ready):", JSON.stringify(await status()));
await p.waitForTimeout(1200);
await p.keyboard.press("Escape");
await p.waitForTimeout(1500);
console.log("Escape (unready):", JSON.stringify(await status()), "still in hangar:", !!(await p.$(".hg")));
await p.keyboard.press("Escape");
await p.waitForTimeout(300);
console.log("Escape again:", JSON.stringify(await status()));
await browser.close();
