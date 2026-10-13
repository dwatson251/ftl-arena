/**
 * LAN tab: two hosts on one network (servers A and B), each creates a match; a friend joins each by code alone
 * and lands in the right one; an unknown code says so.  Usage: npx tsx tools/align/lan.ts <urlA> <urlB>
 */
import { chromium } from "playwright";
const [A, B] = process.argv.slice(2);
const b = await chromium.launch();
const page = async (url: string, name: string) => {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => console.log(name, "pageerror:", e.message));
  await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
  await p.goto(url);
  await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
  await p.click('[data-mode="lan"]');
  await p.fill("#name", name);
  return p;
};
const hostA = await page(A, "HostA");
const hostB = await page(B, "HostB");
await hostA.screenshot({ path: "traces/flows/6-menu-lan.png" });
const create = async (p: typeof hostA) => {
  await p.click("#create");
  await p.waitForSelector(".hg-step");
  await p.waitForTimeout(500);
  return (await p.$eval(".code", (e) => e.textContent ?? "")).trim();
};
const codeA = await create(hostA);
const codeB = await create(hostB);
await hostA.screenshot({ path: "traces/flows/7-lan-host.png" });
console.log("codes", codeA, codeB, "share note A:", JSON.stringify(await hostA.$eval(".share .note:last-child", (e) => e.textContent).catch(() => "")));
const join = async (url: string, code: string, label: string) => {
  const f = await page(url, label);
  await f.fill("#code", code);
  await f.click("#join");
  const ok = await f.waitForSelector(".hg-step", { timeout: 8000 }).then(() => true).catch(() => false);
  console.log(label, "joins", code, ok ? `→ lobby ${(await f.$eval(".code", (e) => e.textContent)).trim()} with ${JSON.stringify(await f.$$eval(".players > *", (es) => es.map((e) => e.textContent?.trim())))}` : `→ error ${JSON.stringify(await f.$eval(".menu .err", (e) => e.textContent).catch(() => ""))}`);
  return f;
};
await join(A, codeB, "FriendViaA");   // A's friend asks for B's code: finds server B
await join(B, codeA, "FriendViaB");   // and the reverse
await join(A, "QQQQ", "Stranger");
await b.close();
