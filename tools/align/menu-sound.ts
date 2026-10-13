/** The main menu's theme and its buttons' hover colour and sounds (network requests stand in for the sound).
 *  Usage: ARENA_URL=<vite dev> npx tsx tools/align/menu-sound.ts */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: "block" })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
const heard: string[] = [];
p.on("request", (r) => /\/assets\/audio\//.test(r.url()) && heard.push(r.url().split("/assets/audio/")[1]));
await p.addInitScript(() => localStorage.setItem("ftl-arena-name", "Ann"));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.waitForTimeout(1500);
console.log("music on the menu:", heard.filter((h) => h.startsWith("music/")).join(", ") || "none");
console.log("playing:", await p.evaluate(() => [...document.querySelectorAll("audio")].length || "(no <audio> in the DOM: created in code)"));
const colour = () => p.$eval('[data-open="lan"]', (e) => getComputedStyle(e).color);
console.log("LAN colour before:", await colour());
await p.hover('[data-open="lan"]');
await p.waitForTimeout(300);
console.log("LAN colour on hover:", await colour());
await b.close();
