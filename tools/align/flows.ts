/**
 * Menu flows (two browser players):
 *  1. bad address → an error, buttons still work;
 *  2. dedicated server: host types its address + Create → the lobby shows that address; friend types address +
 *     code + Join → both in the lobby;
 *  3. wrong code → an error, nothing locks;
 *  4. host on this computer (blank address) + Create → the lobby lists this computer's addresses.
 * Usage: ARENA_URL=http://localhost:5180 npx tsx tools/align/flows.ts <dedicated host:port>   (traces/flows/)
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const ded = process.argv[2] ?? "localhost:9951";
mkdirSync("traces/flows", { recursive: true });
const b = await chromium.launch();
const page = async () => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  await p.goto(URL);
  await p.waitForSelector("#create");
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  await p.click('[data-mode="online"]');
  return p;
};
const err = (p: Page) => p.$eval(".menu .err", (e) => e.textContent ?? "").catch(() => "");
const host = await page();
const friend = await page();

// 1. A bad address.
await host.fill("#name", "Host");
await host.fill("#server", "127.0.0.1:9");
await host.click("#create");
await host.waitForTimeout(7500);
console.log("1 bad address:", JSON.stringify(await err(host)), "create enabled:", await host.$eval("#create", (e) => !(e as HTMLButtonElement).disabled));

// 2. Dedicated server.
await host.fill("#server", ded);
await host.click("#create");
await host.waitForSelector(".hg-step");
await host.waitForTimeout(600);
const code = (await host.$eval(".code", (e) => e.textContent ?? "")).trim();
const shared = await host.$$eval(".share-addr", (es) => es.map((e) => e.textContent));
console.log("2 host created", code, "share shows:", JSON.stringify(shared));
await host.screenshot({ path: "traces/flows/2-host-lobby.png" });

// 3. A wrong code, then the right one.
await friend.fill("#name", "Friend");
await friend.fill("#server", ded);
await friend.fill("#code", "ZZZZ");
await friend.click("#join");
await friend.waitForTimeout(1500);
console.log("3 wrong code:", JSON.stringify(await err(friend)), "join enabled:", await friend.$eval("#join", (e) => !(e as HTMLButtonElement).disabled));
await friend.fill("#code", code);
await friend.click("#join");
await friend.waitForSelector(".hg-step");
await friend.waitForTimeout(600);
console.log("2 friend joined; host sees:", JSON.stringify(await host.$$eval(".players > *", (es) => es.map((e) => e.textContent?.trim()))));
await friend.screenshot({ path: "traces/flows/3-friend-lobby.png" });

// 4. Hosting on this computer.
const local = await page();
await local.fill("#name", "LocalHost");
await local.fill("#server", "");
await local.click("#create");
await local.waitForSelector(".hg-step");
await local.waitForSelector(".share-addr", { timeout: 15000 }).catch(() => {});
console.log("4 local host share:", JSON.stringify(await local.$$eval(".share-addr", (es) => es.map((e) => e.textContent))), JSON.stringify(await local.$eval(".share .note:last-child", (e) => e.textContent).catch(() => "")));
await local.screenshot({ path: "traces/flows/4-local-host.png" });
await b.close();
