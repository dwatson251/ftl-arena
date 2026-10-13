/**
 * Menus with a controller: the D-pad moves focus to the nearest control that way, with a bold ring so it's
 * clear what's selected before anything changes. A presses a button or ticks a box. On a number, slider or
 * dropdown, A starts editing: the D-pad steps the value (↑/→ up, ↓/← down) and A again submits it (B puts
 * the old value back). B also backs out of a focused field. Focus survives the hangar re-rendering itself.
 * LB / RB (L1 / R1) step back and forward through the tabs: the hangar's steps, the main menu's tabs.
 */
import { BTN, type Pad } from "./controller.ts";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

let editing: { el: HTMLInputElement | HTMLSelectElement; old: string } | null = null;
/** What the ring is on, and its signature to find it again after a re-render. */
let current: HTMLElement | null = null;
let lastSig = "";

/** An element's identity across re-renders: tag, id, data attributes and the start of its text. */
function sig(el: Element): string {
  const data = [...el.attributes].filter((a) => a.name.startsWith("data-") || a.name === "id" || a.name === "name").map((a) => `${a.name}=${a.value}`).join("&");
  return `${el.tagName}|${data}|${(el.textContent ?? "").trim().slice(0, 24)}`;
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden";
}

function candidates(root: HTMLElement): HTMLElement[] {
  // An overlay (end screens, rewards) takes the focus to itself.
  const overlays = [...root.querySelectorAll<HTMLElement>(".overlay")].filter(visible);
  const scope = overlays.length ? overlays[overlays.length - 1] : root;
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

/** Put the ring on `el`. Buttons take real focus; fields don't until A starts editing them (a focused field
 *  would hold the hangar's re-renders back). */
function mark(el: HTMLElement | null): void {
  document.querySelectorAll(".pad-focus").forEach((e) => e.classList.remove("pad-focus"));
  current = el;
  if (!el) return;
  el.classList.add("pad-focus");
  const field = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
  if (!field) el.focus({ preventScroll: true });
  else if (document.activeElement instanceof HTMLElement && document.activeElement !== el) document.activeElement.blur();
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  lastSig = sig(el);
}

/** Put the focus ring on an element straight away (an overlay that wants the pad's attention). */
export function focusOn(el: HTMLElement | null): void {
  mark(el);
}

/** The nearest control from `from` in direction (dx, dy): ahead on that axis, weighted against drifting sideways. */
function nearest(from: HTMLElement | null, list: HTMLElement[], dx: number, dy: number): HTMLElement | null {
  if (!from) return list.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] ?? null;
  const f = from.getBoundingClientRect();
  const fx = f.left + f.width / 2;
  const fy = f.top + f.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === from) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const ahead = (ex - fx) * dx + (ey - fy) * dy;
    if (ahead <= 4) continue;
    // Straight ahead (overlapping across the direction of travel) beats anything off to the side.
    const overlap = dx !== 0 ? r.bottom > f.top && r.top < f.bottom : r.right > f.left && r.left < f.right;
    const side = overlap ? 0 : Math.abs((ex - fx) * dy) + Math.abs((ey - fy) * dx) + 40;
    const score = ahead + side * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function finishEdit(commit: boolean): void {
  if (!editing) return;
  const { el, old } = editing;
  editing = null;
  el.classList.remove("pad-editing");
  if (!commit) el.value = old;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
}

function step(el: HTMLInputElement | HTMLSelectElement, dir: 1 | -1): void {
  if (el instanceof HTMLSelectElement) {
    el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
  } else {
    if (dir > 0) el.stepUp();
    else el.stepDown();
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The left stick as a D-pad: one step when pushed, then repeating while held (like a key). */
let stickDir = "";
let stickNext = 0;
function stickStep(p: Pad): [number, number] | null {
  const mag = Math.hypot(p.x, p.y);
  if (mag < 0.5) {
    stickDir = "";
    return null;
  }
  const d: [number, number] = Math.abs(p.x) > Math.abs(p.y) ? [Math.sign(p.x), 0] : [0, Math.sign(p.y)];
  const key = d.join(",");
  if (key !== stickDir) {
    stickDir = key;
    stickNext = p.t + 350;
    return d;
  }
  if (p.t >= stickNext) {
    stickNext = p.t + 120;
    return d;
  }
  return null;
}

/** One frame of menu navigation inside `root`. */
export function menuNav(p: Pad, root: HTMLElement): void {
  const dirs: [number, number, number][] = [[BTN.UP, 0, -1], [BTN.DOWN, 0, 1], [BTN.LEFT, -1, 0], [BTN.RIGHT, 1, 0]];
  const stick = stickStep(p);
  if (editing) {
    if (!document.contains(editing.el)) {
      editing = null;
      return;
    }
    for (const [b, dx, dy] of dirs) if (p.down(b)) step(editing.el, dx + -dy > 0 ? 1 : -1);
    if (stick) step(editing.el, stick[0] + -stick[1] > 0 ? 1 : -1);
    if (p.down(BTN.A)) finishEdit(true);
    else if (p.down(BTN.B)) finishEdit(false);
    return;
  }
  // LB / RB: the previous or next tab (skipping locked ones), unless an overlay has the pad.
  for (const [b, dir] of [[BTN.LB, -1], [BTN.RB, 1]] as const) {
    if (!p.down(b) || [...root.querySelectorAll<HTMLElement>(".overlay")].some(visible)) continue;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>(".hg-step, .tab[data-mode]")].filter(visible);
    const at = tabs.findIndex((t) => t.classList.contains("on"));
    if (at < 0) return;
    for (let i = at + dir; i >= 0 && i < tabs.length; i += dir) {
      if (tabs[i].disabled) continue;
      const sel = tabs[i].classList.contains("hg-step") ? `.hg-step[data-step="${tabs[i].dataset.step}"]` : `.tab[data-mode="${tabs[i].dataset.mode}"]`;
      tabs[i].click();
      // The click re-renders the screen: put the ring on the new tab.
      const now = root.querySelector<HTMLElement>(sel);
      if (now) mark(now);
      break;
    }
    return;
  }
  const list = candidates(root);
  let cur = current && list.includes(current) ? current : null;
  if (cur && !cur.classList.contains("pad-focus")) cur.classList.add("pad-focus");
  // Re-rendered under us: find what was focused again by its signature, and keep the ring on it.
  if (!cur && lastSig) {
    const again = list.find((el) => sig(el) === lastSig);
    if (again) {
      mark(again);
      cur = again;
    }
  }
  for (const [b, dx, dy] of dirs) {
    if (!p.down(b)) continue;
    const next = nearest(cur, list, dx, dy);
    if (next) mark(next);
    return;
  }
  if (stick) {
    const next = nearest(cur, list, stick[0], stick[1]);
    if (next) mark(next);
    return;
  }
  if (p.down(BTN.A) && cur) {
    const editable = (cur instanceof HTMLInputElement && (cur.type === "number" || cur.type === "range")) || cur instanceof HTMLSelectElement;
    if (editable) {
      editing = { el: cur as HTMLInputElement | HTMLSelectElement, old: (cur as HTMLInputElement).value };
      cur.classList.add("pad-editing");
      cur.focus({ preventScroll: true });
    } else cur.click();
    return;
  }
  if (p.down(BTN.B) && cur) {
    cur.blur();
    mark(null);
    lastSig = "";
  }
}
