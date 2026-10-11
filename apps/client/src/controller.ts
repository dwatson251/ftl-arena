/**
 * Controller support (experimental, off unless switched on in Settings). The browser's Gamepad API with the
 * "standard" mapping covers Xbox pads, DualSense/DS4 (Chromium maps them) and Steam controllers (Steam Input
 * presents an Xbox pad), with nothing to install. One poll per animation frame; listeners (the menus, the
 * battle) see the same frame's presses and releases.
 */

/** Standard-mapping button indices (Xbox names; PlayStation: A=✕ B=○ X=□ Y=△, LB/RB=L1/R1, LT/RT=L2/R2). */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/** Held at least this long, a button is a hold (opens a wheel); shorter is a tap. */
export const HOLD_MS = 250;
/** The stick counts as pushed past this (else it's "centred"). */
export const DEAD_ZONE = 0.35;

const KEY = "ftl-arena-controller";

export function controllerEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    // On a Steam Deck (the desktop app adds ?deck=1 in Gaming Mode) it's on until switched off.
    if (v === null) return typeof location !== "undefined" && new URLSearchParams(location.search).get("deck") === "1";
    return v === "1";
  } catch {
    return false;
  }
}

export function setControllerEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
}

export class Pad {
  connected = false;
  name = "";
  /** Reports the standard mapping (the layout above holds). */
  standard = false;
  private now: boolean[] = [];
  private was: boolean[] = [];
  private since: number[] = [];
  /** Left stick, -1..1 each way (y down). */
  x = 0;
  y = 0;
  t = 0;

  poll(): void {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const gp = pads.find((p) => p && p.connected) ?? null;
    this.t = performance.now();
    this.was = this.now;
    if (!gp) {
      this.connected = false;
      this.now = [];
      this.x = this.y = 0;
      return;
    }
    this.connected = true;
    this.name = gp.id;
    this.standard = gp.mapping === "standard";
    // Triggers are analogue: past halfway they're pressed.
    this.now = gp.buttons.map((b) => b.pressed || b.value > 0.5);
    this.now.forEach((p, i) => {
      if (p && !this.was[i]) this.since[i] = this.t;
    });
    this.x = gp.axes[0] ?? 0;
    this.y = gp.axes[1] ?? 0;
  }

  /** Pressed this frame. */
  down(b: number): boolean {
    return !!this.now[b] && !this.was[b];
  }
  /** Released this frame. */
  up(b: number): boolean {
    return !this.now[b] && !!this.was[b];
  }
  held(b: number): boolean {
    return !!this.now[b];
  }
  /** How long it's been held (ms); for a release this frame, how long it was held. */
  heldFor(b: number): number {
    return this.now[b] || this.was[b] ? this.t - (this.since[b] ?? this.t) : 0;
  }
  /** Stick pushed past the dead zone, and which way (radians, 0 = right, clockwise with y down). */
  stick(): { pushed: boolean; angle: number } {
    return { pushed: Math.hypot(this.x, this.y) > DEAD_ZONE, angle: Math.atan2(this.y, this.x) };
  }
}

export const pad = new Pad();

type Listener = (p: Pad) => void;
const listeners: Listener[] = [];

/** Run `fn` every frame with the pad's state (only while controller support is on). Returns an unsubscribe. */
export function onPad(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

let running = false;
/** Start polling (once). */
export function startPad(): void {
  if (running || typeof window === "undefined") return;
  running = true;
  const loop = () => {
    if (controllerEnabled()) {
      pad.poll();
      for (const fn of [...listeners]) {
        try {
          fn(pad);
        } catch (e) {
          console.error("controller:", e);
        }
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
