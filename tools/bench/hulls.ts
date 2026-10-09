/** Screenshot every hangar hull's preview (art/room alignment check). Needs server + client running. */
import { chromium } from "playwright";
const URL = process.argv[2] ?? "http://localhost:5173";
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await p.goto(URL);
await p.waitForSelector("#practice:not([disabled])");
await p.click("#practice");
await p.waitForSelector("select[data-ship]");
const ids = await p.$$eval("select[data-ship] option", (o) => o.map((x) => (x as HTMLOptionElement).value));
for (const id of ids) {
  await p.selectOption("select[data-ship]", id);
  await p.waitForTimeout(700);
  await (await p.$("#preview"))!.screenshot({ path: `traces/hull-${id}.png` });
}
await browser.close();
console.log(ids.length, "hulls");
