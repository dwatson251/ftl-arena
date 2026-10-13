/**
 * The controller's selector wheel: choices round a circle (FTL's system icons, crew faces), steered with the
 * left stick; the middle means "none". It opens while a button is held and commits when it's let go.
 */
import { Container, Graphics, type Texture } from "pixi.js";
import { fstyle, Imm } from "./imm.ts";

export interface WheelItem {
  label: string;
  icon?: Texture | null;
  /** Crew faces (portraits), stacked; a room with several crew is one choice. */
  faces?: (Texture | null)[];
  value: unknown;
}

export class Wheel {
  readonly root = new Container();
  private imm = new Imm(this.root);
  private items: WheelItem[] = [];
  private title = "";
  /** A line under the wheel (what the D-pad does, say). */
  private note = "";
  /** Keeps the last choice when the stick is let go (the D-pad, under the same thumb, then acts on it). */
  private sticky = false;
  private cx = 640;
  private cy = 360;
  /** The highlighted choice (-1: the middle, "none"). */
  sel = -1;
  isOpen = false;

  open(title: string, items: WheelItem[], cx: number, cy: number, opts: { note?: string; sticky?: boolean } = {}): void {
    this.title = title;
    this.note = opts.note ?? "";
    this.sticky = !!opts.sticky;
    this.items = items;
    this.cx = cx;
    this.cy = cy;
    this.sel = -1;
    this.isOpen = true;
  }

  /** New labels for the same choices (live values), keeping the highlighted one. */
  setItems(items: WheelItem[]): void {
    this.items = items;
    if (this.sel >= items.length) this.sel = -1;
  }

  close(): void {
    this.isOpen = false;
    this.imm.begin();
    this.imm.end();
  }

  /** The chosen item, or null for the middle. */
  selected(): WheelItem | null {
    return this.sel >= 0 ? this.items[this.sel] ?? null : null;
  }

  private angleOf(i: number): number {
    return -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, this.items.length);
  }

  /** Point the stick: the nearest choice that way; let go (centred) and it's the middle. */
  steer(s: { pushed: boolean; angle: number }): void {
    if (!s.pushed) {
      if (!this.sticky) this.sel = -1;
      return;
    }
    let best = -1;
    let bestD = Infinity;
    this.items.forEach((_, i) => {
      let d = Math.abs(s.angle - this.angleOf(i)) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.sel = best;
  }

  draw(time: number): void {
    const h = this.imm;
    h.begin();
    if (!this.isOpen) return h.end();
    const n = this.items.length;
    // A segmented ring: one slice per choice round a hub that means "none".
    const r0 = 46;
    const R = Math.max(130, Math.min(190, 90 + n * 10));
    const { cx, cy } = this;
    const span = (Math.PI * 2) / Math.max(1, n);
    const gap = Math.min(0.04, span * 0.08);
    const g = h.gfx("bg") as Graphics;
    this.items.forEach((_, i) => {
      const a = this.angleOf(i);
      const on = i === this.sel;
      const a0 = a - span / 2 + gap;
      const a1 = a + span / 2 - gap;
      const out = on ? R + 8 : R;
      g.moveTo(cx + Math.cos(a0) * (r0 + 4), cy + Math.sin(a0) * (r0 + 4))
        .arc(cx, cy, out, a0, a1)
        .arc(cx, cy, r0 + 4, a1, a0, true)
        .closePath()
        .fill({ color: on ? 0x4a3a12 : 0x161b24, alpha: on ? 0.95 : 0.85 })
        .stroke({ color: on ? 0xffd76a : 0x6d7686, width: on ? 3 : 1.5, alpha: on ? 1 : 0.8 });
    });
    // The hub: "none".
    const mid = this.sel < 0;
    g.circle(cx, cy, r0).fill({ color: mid ? 0x4a3a12 : 0x1b1f27, alpha: 0.95 }).stroke({ color: mid ? 0xffd76a : 0x6d7686, width: mid ? 3 : 2 });
    h.text("title", this.title, cx, cy - R - 26, fstyle("JustinFont12Bold", 0xe8ece8, { stroke: 0x101010, strokeWidth: 3 }), [0.5, 0.5]);
    if (this.note) h.text("note", this.note, cx, cy + R + 22, fstyle("JustinFont10", 0xc8d0dc, { stroke: 0x101010, strokeWidth: 3 }), [0.5, 0.5]);
    const pick = this.selected();
    h.text("mid", pick ? "Pick" : "None", cx, cy, fstyle("JustinFont10", pick ? 0xffd76a : 0xc8d0dc, { stroke: 0x101010 }), [0.5, 0.5]);
    this.items.forEach((it, i) => {
      const a = this.angleOf(i);
      const on = i === this.sel;
      const rm = (r0 + R) / 2 + (on ? 4 : 0);
      const x = cx + Math.cos(a) * rm;
      const y = cy + Math.sin(a) * rm;
      const pulse = on ? 1 + 0.05 * Math.sin(time * 10) : 1;
      if (it.icon) h.sprite(`ic${i}`, it.icon, x, y - (it.faces?.length ? 7 : 4), { anchor: 0.5, scale: 0.65 * pulse, tint: 0xffffff });
      (it.faces ?? []).slice(0, 4).forEach((f, k, all) => {
        if (!f) return;
        const off = (k - (all.length - 1) / 2) * 12;
        h.sprite(`fc${i}_${k}`, f, x + off, y + (it.icon ? 10 : -4), { anchor: 0.5, scale: (it.icon ? 0.45 : 0.75) * pulse });
      });
      h.text(`lb${i}`, it.label, x, y + (it.icon || it.faces?.length ? 16 : 0), fstyle("JustinFont10", on ? 0xffd76a : 0xffffff, { stroke: 0x101010 }), [0.5, 0.5]);
    });
    h.end();
  }
}
