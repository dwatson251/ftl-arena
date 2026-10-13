/** Dropdowns repaint at once: pick an option with the select focused (as a mouse pick leaves it) and the
 *  options it reveals show up with no further click.   Usage: ARENA_URL=... npx tsx tools/align/dropdowns.ts */
import { chromium } from "playwright";
const URL = process.env.ARENA_URL ?? "http://localhost:5173";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message));
await p.addInitScript(() => localStorage.getItem("ftl-arena-name") || localStorage.setItem("ftl-arena-name", "Captain"));
await p.goto(URL);
await p.waitForSelector("#loading", { state: "detached", timeout: 60000 });
await p.click('[data-open="single"]');
await p.waitForSelector(".hg-step");
await p.waitForTimeout(500);
const pick = async (sel: string, v: string) => {
  await p.focus(sel);
  await p.selectOption(sel, v);
  await p.waitForTimeout(400);
};
await pick('select[data-cfg="pause"]', "tactical");
console.log("pause → tactical: timeout fields shown:", !!(await p.$('input[data-cfg="tacticalEvery"]')), "| focus on:", await p.evaluate(() => document.activeElement?.tagName));
await pick('select[data-cfg="winCondition"]', "survival");
console.log("game mode → survival: locked tabs:", await p.$$eval(".hg-step.locked", (e) => e.length), "| summary:", await p.$eval(".rules-summary", (e) => e.textContent?.replace(/\s+/g, " ").slice(0, 40)));
await pick('select[data-cfg="winCondition"]', "hull");
console.log("game mode → destroy the ship: locked tabs:", await p.$$eval(".hg-step.locked", (e) => e.length), "| ships select back:", !!(await p.$('select[data-cfg="ftlOnly"]')));
await b.close();
