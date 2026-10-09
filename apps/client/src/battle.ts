/**
 * The combat screen, laid out like FTL's 1280×720 combat view and drawn with FTL's own UI art when it has
 * been extracted. Everything the player does becomes a Command; everything drawn comes from the latest
 * server snapshot, interpolated between snapshots.
 *
 * Shots: FTL shows two views of space, so a shot leaves its own ship's view, vanishes, and a moment later
 * enters the other view and flies to the target. The sim's flight time is split into those phases.
 */
import { Application, Container, FederatedPointerEvent, Graphics, Sprite } from "pixi.js";
import type { GameDB, SystemId } from "@ftl/data";
import { SUBSYSTEMS } from "@ftl/data";
import { RULES, SNAP_HZ, usable, type Command, type MatchView, type ShipView, type WeaponTarget } from "./simlite.ts";
import { animFrame, texNow } from "./assets.ts";
import { play, setSound, soundOn } from "./audio.ts";
import { Imm, style } from "./imm.ts";
import { ShipRenderer, type CrewDraw } from "./render/ship.ts";

const W = 1280;
const H = 720;
/** Own-ship view (everything left of the hostiles window). */
const OWN = { x: 150, y: 150, w: 690, h: 440, clipX: 858 };
/** FTL's hostiles window and the area inside it where the enemy ship is drawn. */
const WIN = { x: 862, y: 60, w: 410, h: 555 };
const WIN_SHIP = { x: WIN.x + 22, y: WIN.y + 100, w: 360, h: 425 };
const SYS_ORDER: SystemId[] = ["shields", "engines", "oxygen", "weapons", "medbay", "pilot", "sensors", "doors"];
const BAR_W = 18;
const BAR_H = 7;
const SYS_X0 = 62;
const SYS_DX = 38;
const SYS_ICON_Y = 682;
const WEAP_Y = 626;

interface Fx {
  node: Container;
  born: number;
  until: number;
  update?: (k: number) => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inBox = (p: { x: number; y: number }, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
/** Stable pseudo-random in [0,1) from an integer. */
const hash01 = (n: number) => Math.abs(Math.sin(n * 91.345 + 3.1) * 43758.5453) % 1;

export class Battle {
  stage = new Container();
  private bgLayer = new Container();
  private world = new Container();
  private ownBox = new Container();
  private winLayer = new Container();
  private enemyBox = new Container();
  private projOwn = new Container();
  private projWin = new Container();
  private fxOwn = new Container();
  private fxWin = new Container();
  private hudRoot = new Container();
  private hud: Imm;
  own!: ShipRenderer;
  enemy!: ShipRenderer;
  private view: MatchView | null = null;
  private prev: MatchView | null = null;
  private snapAt = 0;
  private selected = new Set<number>();
  private armed: number | null = null;
  private beamStart: { x: number; y: number } | null = null;
  private hoverOwn = { room: -1, door: -1 };
  private hoverEnemy = { room: -1, door: -1 };
  private drag: { x: number; y: number; x2: number; y2: number } | null = null;
  private fx: Fx[] = [];
  private time = 0;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private sysHit: { id: SystemId; box: Box }[] = [];
  private weapHit: { slot: number; box: Box }[] = [];
  private autoBox: Box | null = null;
  private crewHit: { id: number; box: Box }[] = [];
  private doorBtns: { open: boolean; box: Box }[] = [];
  /** Weapon fire times for the hull firing animation: `${ship}:${slot}` -> time. */
  private firedAt = new Map<string, number>();
  private shieldHitAt: [number, number] = [-9, -9];
  private walking = new Map<number, string>();
  private flashTiles = new Map<string, number>();
  /** Hull break-up: ship index -> time it blew. */
  private explodedAt = new Map<number, number>();
  private endReadyAt: number | null = null;
  onEndReady: () => void = () => {};

  constructor(private app: Application, private db: GameDB, private send: (c: Command) => void, public you: 0 | 1) {
    this.hud = new Imm(this.hudRoot);
    // Own-side layers are clipped at the hostiles window; window layers are clipped by FTL's window mask.
    const ownClip = new Graphics().rect(0, 0, OWN.clipX, H).fill({ color: 0xffffff });
    const ownProjMaskHolder = new Container();
    ownProjMaskHolder.addChild(this.projOwn, this.fxOwn);
    ownProjMaskHolder.mask = ownClip;
    this.winLayer.addChild(this.enemyBox, this.projWin, this.fxWin);
    this.world.addChild(this.ownBox, ownClip, ownProjMaskHolder, this.winLayer);
    this.stage.addChild(this.bgLayer, this.world, this.hudRoot);
    this.stage.eventMode = "static";
    this.stage.hitArea = { contains: () => true };
    this.stage.on("pointerdown", (e) => this.onDown(e));
    this.stage.on("pointermove", (e) => this.onMove(e));
    this.stage.on("pointerup", (e) => this.onUp(e));
    window.addEventListener("keydown", this.keyHandler);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.keyHandler);
    this.stage.destroy({ children: true });
  }

  private setupShips(v: MatchView): void {
    const own = v.ships[v.you];
    const en = v.ships[1 - v.you];
    this.own = new ShipRenderer(this.db, own.bp, false, 0);
    // The enemy stands vertically, nose up, inside the hostiles window.
    this.enemy = new ShipRenderer(this.db, en.bp, true, Math.PI / 2);
    this.ownBox.addChild(this.own.root);
    this.enemyBox.addChild(this.enemy.root);
    const bg = texNow("stars/bg_darknebula.png");
    if (bg) {
      const s = new Sprite(bg);
      s.width = W;
      s.height = H;
      this.bgLayer.addChild(s);
    }
    const frameTex = texNow("combatUI/box_hostiles2.png");
    const maskTex = texNow("combatUI/box_hostiles_mask.png");
    if (frameTex) {
      const f = new Sprite(frameTex);
      f.position.set(WIN.x, WIN.y);
      f.alpha = 0.92;
      this.world.addChildAt(f, this.world.getChildIndex(this.winLayer));
    } else {
      this.world.addChildAt(new Graphics().roundRect(WIN.x + 10, WIN.y + 25, WIN.w - 20, WIN.h - 30, 8).fill({ color: 0x2a1c26, alpha: 0.85 }).stroke({ color: 0xe8efe8, width: 3 }), this.world.getChildIndex(this.winLayer));
    }
    // The inside of FTL's box_hostiles_mask, as a polygon (Pixi sprite masks read red×alpha and the
    // mask art is black, so it can't be used directly).
    const X = WIN.x;
    const Y = WIN.y;
    const mask = new Graphics()
      .poly([X + 14, Y + 29, X + 380, Y + 29, X + 389, Y + 38, X + 389, Y + 520, X + 375, Y + 520, X + 375, Y + 532, X + 58, Y + 532, X + 14, Y + 488])
      .fill({ color: 0xffffff });
    void maskTex;
    this.world.addChild(mask);
    this.winLayer.mask = mask;
    this.fit();
  }

  private fit(): void {
    const o = this.own.bounds();
    const s = Math.min(1, OWN.w / o.w, OWN.h / o.h);
    this.own.root.scale.set(s);
    this.own.root.position.set(OWN.x + OWN.w / 2 - (o.x + o.w / 2) * s, OWN.y + OWN.h / 2 - (o.y + o.h / 2) * s);
    // Rotated -90°: the hull's width becomes the window's height.
    const e = this.enemy.bounds();
    const se = Math.min(0.85, WIN_SHIP.w / e.h, WIN_SHIP.h / e.w);
    this.enemy.root.scale.set(se);
    this.enemy.root.rotation = -Math.PI / 2;
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    // After rotating by -90°, a local point (x, y) maps to (y, -x) * scale.
    this.enemy.root.position.set(WIN_SHIP.x + WIN_SHIP.w / 2 - cy * se, WIN_SHIP.y + WIN_SHIP.h / 2 + cx * se);
  }

  onSnapshot(v: MatchView): void {
    if (!this.view) this.setupShips(v);
    this.prev = this.view ?? v;
    this.view = v;
    this.snapAt = performance.now();
    for (const e of v.events) this.onEvent(e);
    const own = v.ships[v.you];
    for (const id of [...this.selected]) if (!own.crew.find((c) => c.id === id && !c.dead)) this.selected.delete(id);
    // Destination flash: keep the tile lit briefly after a crew member arrives.
    for (const c of own.crew) {
      const was = this.walking.get(c.id);
      if (c.path.length) this.walking.set(c.id, c.home);
      else if (was) {
        this.flashTiles.set(was, 0.45);
        this.walking.delete(c.id);
      }
    }
  }

  debugState() {
    return { time: this.time, endReadyAt: this.endReadyAt, exploded: [...this.explodedAt] };
  }

  /** True once the end-of-match explosion has played out. */
  endReady(): boolean {
    return this.endReadyAt !== null && this.time >= this.endReadyAt;
  }

  private onEvent(e: MatchView["events"][number]): void {
    const v = this.view!;
    const bpOf = (ship: 0 | 1, slot: number) => this.db.weapons[v.ships[ship].weapons[slot]?.bp];
    switch (e.e) {
      case "fire":
        this.firedAt.set(`${e.ship}:${e.slot}`, this.time);
        play(this.db, bpOf(e.ship, e.slot)?.sounds?.launch, e.ship === v.you ? 1 : 0.6);
        break;
      case "hit":
        this.boom(e.ship, e.px, e.py, e.damage > 0 ? 1 : 0.7);
        play(this.db, ["hitHull2", "hitHull3", "smallExplosion"]);
        break;
      case "shield":
        this.shieldHitAt[e.ship] = this.time;
        this.ripple(e.ship, e.px, e.py);
        play(this.db, ["hitShield1", "hitShield2", "hitShield3"]);
        break;
      case "miss":
        this.missFly(e.ship, e.px, e.py);
        this.floatText(e.ship, e.px, e.py, "MISS", 0xdddddd);
        play(this.db, ["miss"]);
        break;
      case "beam":
        this.beam(e.ship, e.x1, e.y1, e.x2, e.y2, e.blocked);
        break;
      case "death":
        play(this.db, ["death1", "death2"], e.ship === v.you ? 1 : 0.5);
        break;
      case "end": {
        const loser = e.winner === -1 ? -1 : 1 - e.winner;
        const destroyed = v.ships.map((s, i) => (s.hull <= 0 || (loser === i && /destroyed/.test(e.reason)) ? i : -1)).filter((i) => i >= 0);
        for (const i of destroyed) this.explode(i);
        this.endReadyAt = this.time + (destroyed.length ? 4.2 : 1.2);
        setTimeout(() => this.onEndReady(), (this.endReadyAt - this.time) * 1000 + 50);
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- effects

  private rOf(ship: number) {
    return ship === this.view!.you ? this.own : this.enemy;
  }

  private fxLayerOf(ship: number) {
    return ship === this.view!.you ? this.fxOwn : this.fxWin;
  }

  private addFx(layer: Container, node: Container, secs: number, update?: (k: number) => void): void {
    layer.addChild(node);
    this.fx.push({ node, born: this.time, until: this.time + secs, update });
  }

  private at(ship: number, x: number, y: number) {
    return this.stage.toLocal(this.rOf(ship).root.toGlobal({ x, y }));
  }

  private boom(ship: number, x: number, y: number, size: number, anim = "explosion1"): void {
    const p = this.at(ship, x, y);
    const c = new Container();
    c.position.copyFrom(p);
    const sp = new Sprite();
    sp.anchor.set(0.5);
    sp.scale.set(size * 1.6);
    const fallback = new Graphics().circle(0, 0, 14 * size).fill({ color: 0xffb040 });
    c.addChild(sp, fallback);
    this.addFx(this.fxLayerOf(ship), c, 0.75, (k) => {
      const f = animFrame(this.db, anim, Math.floor(k * 10));
      if (f) {
        sp.texture = f;
        fallback.visible = false;
      } else {
        fallback.scale.set(1 + k);
        fallback.alpha = 1 - k;
      }
    });
  }

  private ripple(ship: number, x: number, y: number): void {
    const p = this.at(ship, x, y);
    const g = new Graphics();
    g.position.copyFrom(p);
    this.addFx(this.fxLayerOf(ship), g, 0.5, (k) => g.clear().circle(0, 0, 10 + 40 * k).stroke({ color: 0x8fd0ff, width: 3, alpha: 1 - k }));
  }

  private floatText(ship: number, x: number, y: number, s: string, color: number): void {
    const p = this.at(ship, x, y);
    const c = new Container();
    const im = new Imm(c);
    im.begin();
    im.text("t", s, 0, 0, style(16, color, "700"), [0.5, 0.5]);
    im.end();
    c.position.copyFrom(p);
    this.addFx(this.fxLayerOf(ship), c, 0.9, (k) => {
      c.y = p.y - 30 * k;
      c.alpha = 1 - k;
    });
  }

  /** A missed shot keeps flying past the ship. */
  private missFly(ship: number, x: number, y: number): void {
    const p = this.at(ship, x, y);
    const dir = ship === this.view!.you ? -1 : 1;
    const g = new Graphics().roundRect(-10, -2.5, 20, 5, 2).fill({ color: 0xff7050 });
    g.position.copyFrom(p);
    this.addFx(this.fxLayerOf(ship), g, 0.6, (k) => {
      g.x = p.x + dir * 300 * k;
      g.alpha = 1 - k;
    });
  }

  private beam(ship: number, x1: number, y1: number, x2: number, y2: number, blocked: boolean): void {
    const a = this.at(ship, x1, y1);
    const b = this.at(ship, x2, y2);
    const g = new Graphics();
    this.addFx(this.fxLayerOf(ship), g, RULES.beamSweep + 0.3, (k) => {
      const kk = Math.min(1, k * 1.4);
      g.clear()
        .moveTo(a.x, a.y)
        .lineTo(a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk)
        .stroke({ color: blocked ? 0x7fc4ff : 0xff4a3a, width: 6, alpha: 1 - k * 0.6 })
        .moveTo(a.x, a.y)
        .lineTo(a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk)
        .stroke({ color: 0xffffff, width: 2, alpha: 1 - k * 0.6 });
    });
  }

  /** The hull breaks into its gibs, with explosions across it. */
  private explode(ship: number): void {
    this.explodedAt.set(ship, this.time);
    const r = this.rOf(ship);
    const b = r.bounds();
    for (let i = 0; i < 9; i++) {
      setTimeout(() => {
        if (!this.view) return;
        const x = b.x + b.w * (0.15 + 0.7 * hash01(i * 3 + ship));
        const y = b.y + b.h * (0.2 + 0.6 * hash01(i * 7 + ship));
        this.boom(ship, x, y, 1.6 + hash01(i) * 1.2, i % 2 ? "explosion1" : "explosion1");
        if (i % 3 === 0) play(this.db, ["explosion1", "explosion2", "explosion3", "explosion4"]);
      }, i * 160);
    }
  }

  private toastEl: HTMLDivElement | null = null;
  toast(msg: string): void {
    if (!this.toastEl) {
      this.toastEl = document.createElement("div");
      this.toastEl.className = "toast";
      document.getElementById("ui")!.appendChild(this.toastEl);
    }
    this.toastEl.textContent = msg;
    this.toastEl.style.display = "block";
    window.clearTimeout(Number(this.toastEl.dataset.t));
    this.toastEl.dataset.t = String(window.setTimeout(() => this.toastEl && (this.toastEl.style.display = "none"), 2000));
  }

  // ---------------------------------------------------------------- frame

  frame(dt: number): void {
    this.time += dt;
    const v = this.view;
    if (!v) return;
    for (const [k, left] of this.flashTiles) left - dt <= 0 ? this.flashTiles.delete(k) : this.flashTiles.set(k, left - dt);
    const k = Math.min(1, (performance.now() - this.snapAt) / (1000 / SNAP_HZ));
    const ownV = v.ships[v.you];
    const enV = v.ships[1 - v.you];
    const ex = (i: number) => (this.explodedAt.has(i) ? this.time - this.explodedAt.get(i)! : null);
    this.own.update(ownV, this.crewDraw(ownV, this.prev?.ships[v.you], k, true), this.time, {
      hover: this.hoverOwn, weaponFrame: (s) => this.weaponFrameFor(ownV, v.you, s), shieldFlash: this.time - this.shieldHitAt[v.you],
      exploded: ex(v.you), destinations: true, flashTiles: this.flashTiles,
    });
    this.enemy.update(enV, this.crewDraw(enV, this.prev?.ships[1 - v.you], k, false), this.time, {
      hover: this.armed !== null ? this.hoverEnemy : { room: -1, door: -1 }, weaponFrame: (s) => this.weaponFrameFor(enV, (1 - v.you) as 0 | 1, s),
      shieldFlash: this.time - this.shieldHitAt[1 - v.you], exploded: ex(1 - v.you),
    });
    this.drawTargets(ownV);
    this.drawProjectiles(v, k);
    for (const f of [...this.fx]) {
      f.update?.(Math.min(1, (this.time - f.born) / (f.until - f.born)));
      if (this.time >= f.until) {
        f.node.destroy();
        this.fx.splice(this.fx.indexOf(f), 1);
      }
    }
    this.drawHud(v);
  }

  /** Hull weapon art: lights come on frame by frame as it charges, then the fire frames play. */
  private weaponFrameFor(s: ShipView, ship: 0 | 1, slot: number): number {
    const w = s.weapons[slot];
    const bp = this.db.weapons[w.bp];
    const anim = bp && this.db.weaponAnims[bp.weaponArt];
    if (!anim) return 0;
    const fired = this.firedAt.get(`${ship}:${slot}`);
    if (fired !== undefined && this.time - fired < 0.35) {
      const n = anim.frames - anim.fireFrame;
      return Math.min(anim.frames - 1, anim.fireFrame + Math.floor(((this.time - fired) / 0.35) * n));
    }
    if (w.charge < 0) return 0; // unknown (sensors)
    if (w.volleys > 0) return anim.chargedFrame;
    if (!w.powered) return 0;
    return Math.floor(Math.min(0.999, w.charge / (bp.cooldown || 1)) * anim.chargedFrame);
  }

  private crewDraw(s: ShipView, prev: ShipView | undefined, k: number, mine: boolean): CrewDraw[] {
    return s.crew.map((c) => {
      const p = prev?.crew.find((q) => q.id === c.id);
      return { c, x: p ? p.x + (c.x - p.x) * k : c.x, y: p ? p.y + (c.y - p.y) * k : c.y, selected: mine && this.selected.has(c.id) };
    });
  }

  private drawTargets(own: ShipView): void {
    const g = this.enemy.overlay.clear();
    const crosshair = (cx: number, cy: number, n: number, auto: boolean) => {
      g.circle(cx, cy, 11).stroke({ color: auto ? 0xffd040 : 0xff4040, width: 2.5 });
      g.moveTo(cx - 15, cy).lineTo(cx - 6, cy).moveTo(cx + 6, cy).lineTo(cx + 15, cy).moveTo(cx, cy - 15).lineTo(cx, cy - 6).moveTo(cx, cy + 6).lineTo(cx, cy + 15).stroke({ color: 0xff4040, width: 2 });
      void n;
    };
    own.weapons.forEach((w, i) => {
      if (!w.target) return;
      if (w.target.kind === "room") {
        const r = this.enemy.layout.rooms.find((q) => q.id === (w.target as { room: number }).room);
        if (!r) return;
        const off = (i - 1.5) * 8;
        crosshair((r.x + r.w / 2) * 35 + off, (r.y + r.h / 2) * 35 + off, i + 1, w.autofire);
      } else {
        const t = w.target;
        const L = this.db.weapons[w.bp]?.length || 60;
        const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1) || 1;
        g.moveTo(t.x1, t.y1).lineTo(t.x1 + ((t.x2 - t.x1) / len) * L, t.y1 + ((t.y2 - t.y1) / len) * L).stroke({ color: 0xff5050, width: 3, alpha: 0.85 });
      }
    });
    if (this.beamStart && this.armed !== null) g.circle(this.beamStart.x, this.beamStart.y, 6).fill({ color: 0xff5050 });
    const o = this.own.overlay.clear();
    if (this.drag) {
      const a = this.own.root.toLocal({ x: this.drag.x, y: this.drag.y }, this.stage);
      const b = this.own.root.toLocal({ x: this.drag.x2, y: this.drag.y2 }, this.stage);
      o.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)).fill({ color: 0x30ff30, alpha: 0.08 }).stroke({ color: 0x30ff30, width: 1.5 });
    }
  }

  // ---------------------------------------------------------------- projectiles

  private drawProjectiles(v: MatchView, k: number): void {
    this.projOwn.removeChildren();
    this.projWin.removeChildren();
    const dtSnap = k / SNAP_HZ;
    for (const p of v.projectiles) {
      if (p.kind === "BEAM") continue;
      if (p.delay - dtSnap > 0) continue;
      const mine = p.from === v.you;
      const src = mine ? this.own : this.enemy;
      const dst = mine ? this.enemy : this.own;
      const t = p.t + Math.max(0, dtSnap - Math.max(0, p.delay));
      const F = p.flight;
      const bp = this.db.weapons[p.weapon];
      // Phases: leave own view (35 %), gap (15 %), cross the target view (50 %). Bombs teleport.
      const k1 = t / (F * 0.35);
      const k2 = (t - F * 0.5) / (F * 0.5);
      let tx = p.px;
      let ty = p.py;
      if (p.target.kind === "room" && !(tx || ty)) {
        const r = dst.layout.rooms.find((q) => q.id === (p.target as { room: number }).room)!;
        tx = (r.x + r.w / 2) * 35;
        ty = (r.y + r.h / 2) * 35;
      }
      const target = this.stage.toLocal(dst.root.toGlobal({ x: tx, y: ty }));
      if (p.kind === "BOMB") {
        if (k2 >= 0) this.drawShot(mine ? this.projWin : this.projOwn, bp?.image, target.x, target.y, 0, "BOMB", Math.min(1, k2 * 2));
        continue;
      }
      const slotBp = v.ships[p.from].weapons[p.slot]?.bp ?? p.weapon;
      const muzzle = this.stage.toLocal(src.root.toGlobal(src.muzzlePoint(p.slot, slotBp)));
      if (k1 <= 1) {
        // Out of the source view: own shots fly right, off our screen; enemy shots fly up, out of its window.
        const exit = mine ? { x: OWN.clipX + 60, y: muzzle.y - 20 } : { x: muzzle.x, y: WIN.y - 40 };
        const x = muzzle.x + (exit.x - muzzle.x) * k1;
        const y = muzzle.y + (exit.y - muzzle.y) * k1;
        this.drawShot(mine ? this.projOwn : this.projWin, bp?.image, x, y, Math.atan2(exit.y - muzzle.y, exit.x - muzzle.x), p.kind, 1);
      } else if (k2 >= 0) {
        // Into the target view from its edge facing the attacker.
        const entry = mine
          ? { x: WIN.x + 10, y: target.y + (hash01(p.id) - 0.5) * 160 }
          : { x: OWN.clipX + 10, y: target.y + (hash01(p.id) - 0.5) * 220 };
        const kk = Math.min(1, k2);
        const x = entry.x + (target.x - entry.x) * kk;
        const y = entry.y + (target.y - entry.y) * kk;
        this.drawShot(mine ? this.projWin : this.projOwn, bp?.image, x, y, Math.atan2(target.y - entry.y, target.x - entry.x), p.kind, 1);
      }
    }
  }

  private drawShot(layer: Container, image: string | undefined, x: number, y: number, ang: number, kind: string, alpha: number): void {
    const f = image ? animFrame(this.db, image, Math.floor(this.time * 10)) : null;
    if (f) {
      const s = new Sprite(f);
      s.anchor.set(0.5);
      s.position.set(x, y);
      // Missile and bomb art point up; laser art points right.
      s.rotation = kind === "MISSILES" ? ang + Math.PI / 2 : kind === "BOMB" ? 0 : ang;
      if (kind === "MISSILES") s.scale.set(0.7);
      s.alpha = alpha;
      layer.addChild(s);
      return;
    }
    const color = kind === "MISSILES" ? 0xffd27a : kind === "BURST" ? 0xc0a080 : kind === "BOMB" ? 0x9fe07f : 0xff5040;
    const g = new Graphics();
    g.position.set(x, y);
    g.rotation = ang;
    g.alpha = alpha;
    if (kind === "MISSILES") g.rect(-9, -3, 18, 6).fill({ color });
    else if (kind === "BURST" || kind === "BOMB") g.circle(0, 0, 5).fill({ color });
    else g.roundRect(-10, -2.5, 20, 5, 2).fill({ color });
    layer.addChild(g);
  }

  // ---------------------------------------------------------------- HUD

  private drawHud(v: MatchView): void {
    const h = this.hud;
    h.begin();
    const own = v.ships[v.you];
    const en = v.ships[1 - v.you];
    this.topLeft(own);
    this.hostilesHeader(en, v);
    this.crewList(own);
    this.systemsBar(own);
    this.weaponsTray(own);
    if (this.armed !== null) {
      const bp = this.db.weapons[own.weapons[this.armed]?.bp];
      const msg = bp?.type === "BEAM" ? (this.beamStart ? "Click to set the beam's direction" : "Click the enemy ship to start the beam") : "Click an enemy room to target · right-click to cancel";
      h.text("hint", msg, OWN.x + OWN.w / 2, 594, style(14, 0xffd27a, "700"), [0.5, 0]);
    }
    const mode = v.config.winCondition === "crew" ? "VICTORY: KILL THE ENEMY CREW" : "VICTORY: DESTROY THE ENEMY SHIP";
    h.text("mode", mode, 650, 10, style(12, 0x9fb5d0, "700"), [0.5, 0]);
    if (v.config.timeLimit > 0) {
      const left = Math.max(0, v.config.timeLimit - v.tick / 30);
      h.text("clock", `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`, 650, 28, style(18, 0xffffff, "700"), [0.5, 0]);
    }
    h.text(
      "help",
      "1-4: arm weapon → click room · right-click weapon: off\ndrag crew → right-click room · Tab: all · bars: ±power\nZ/X: doors · M: sound " + (soundOn() ? "on" : "off"),
      W - 8, H - 6, style(10, 0x8f99a8, "400", "right"), [1, 1],
    );
    h.end();
  }

  /** FTL's top-left status: hull frame + segment mask, shields panel, evade/O2 panel, missiles. */
  private topLeft(s: ShipView): void {
    const h = this.hud;
    const low = s.hull / s.maxHull <= 0.33;
    const frameT = texNow(low ? "statusUI/top_hull_red.png" : "statusUI/top_hull.png");
    const mask = texNow("statusUI/top_hull_bar_mask.png");
    const col = s.hull / s.maxHull > 0.66 ? 0x78ff78 : s.hull / s.maxHull > 0.33 ? 0xffe050 : 0xff5040;
    if (frameT && mask) {
      h.sprite("hullF", frameT, 0, 0);
      // The mask art has 30 segments (11 px + 1 px gap): dark for lost hull, coloured for what's left.
      h.sprite("hullMaskShape", mask, 8, 0, { tint: 0x202020, alpha: 0.85 });
      const g = h.gfx("hullSeg");
      const lit = Math.round((s.hull / s.maxHull) * 30);
      for (let i = 0; i < lit; i++) g.rect(8 + i * 12, 0, 11, 65).fill({ color: col });
      g.mask = this.hullMask(mask);
      h.sprite("hullLabel", texNow(low ? "statusUI/top_hull_red_label.png" : "statusUI/top_hull_label.png"), 0, 0);
      h.text("hullT", "HULL", 6, 5, style(10, 0x1a1a1a, "700"));
    } else {
      h.text("hullT", "HULL", 10, 14, style(11, 0xb8c0cc, "700"));
      const g = h.gfx("hullSeg");
      for (let i = 0; i < s.maxHull; i++) g.rect(50 + i * 11, 12, 9, 18).fill({ color: i < s.hull ? col : 0x2a2a2a });
    }
    // Shields panel: one square per possible layer, lit when up, with the recharge bar under it.
    const sh = s.systems.shields;
    const max = sh ? Math.floor(Math.min(sh.power + (sh.bonus ?? 0), usable(sh)) / 2) : 0;
    const panel = texNow("statusUI/top_shields4_on.png");
    const on = texNow("statusUI/top_shieldsquare1_on.png");
    const off = texNow("statusUI/top_shieldsquare1_off.png");
    const py = 52;
    if (panel) h.sprite("shP", panel, 2, py);
    const g = h.gfx("shBar");
    for (let i = 0; i < Math.max(4, max); i++) {
      const x = 34 + i * 24;
      if (i < max || i < s.shieldLayers) {
        if (on && off) h.sprite(`shS${i}`, i < s.shieldLayers ? on : off, x - 5, py + 1);
        else g.circle(x + 10, py + 16, 9).fill({ color: i < s.shieldLayers ? 0x4aa8ff : 0x1c2a3a }).stroke({ color: 0x6fc0ff, width: 2 });
      }
    }
    if (s.shieldLayers < max) g.rect(30, py + 37, 98 * s.shieldCharge, 5).fill({ color: 0x4aa8ff });
    // Evasion and oxygen
    const eo = texNow("statusUI/top_evade_oxygen.png");
    const ey = 104;
    if (eo) h.sprite("eo", eo, 2, ey);
    const o2 = Math.round(s.rooms.reduce((a, r) => a + r.o2, 0) / s.rooms.length);
    h.text("evT", `${s.evasion}%`, 48, ey + 9, style(13, 0xffffff, "700"));
    h.text("o2T", `${o2}%`, 48, ey + 31, style(13, o2 < 30 ? 0xff6050 : 0xffffff, "700"));
    // Missiles
    const mt = texNow(s.missiles > 0 ? "statusUI/top_missiles_on.png" : "statusUI/top_missiles_on_red.png");
    if (mt) h.sprite("msl", mt, 388, 8);
    h.text("mslT", String(s.missiles), 437, 18, style(15, 0xffffff, "700"), [0.5, 0]);
  }

  private hullMaskSprite: Sprite | null = null;
  private hullMask(mask: import("pixi.js").Texture): Sprite {
    if (!this.hullMaskSprite) {
      this.hullMaskSprite = new Sprite(mask);
      this.hullMaskSprite.position.set(8, 0);
      this.hudRoot.addChild(this.hullMaskSprite);
    }
    return this.hullMaskSprite;
  }

  /** Inside the hostiles window: enemy name, hull, shields, evasion, and weapon charge (sensors 3). */
  private hostilesHeader(en: ShipView, v: MatchView): void {
    const h = this.hud;
    const x = WIN.x + 26;
    const y = WIN.y + 38;
    h.text("enName", `${en.player.toUpperCase()} · ${this.db.ships[en.bp]?.title ?? en.bp}`, x, y - 2, style(12, 0xffd0c8, "700"));
    const g = h.gfx("enHull");
    const segW = 240 / en.maxHull;
    for (let i = 0; i < en.maxHull; i++) {
      const lit = i < en.hull;
      const col = en.hull / en.maxHull > 0.66 ? 0x78ff78 : en.hull / en.maxHull > 0.33 ? 0xffe050 : 0xff5040;
      g.rect(x + i * segW, y + 18, Math.max(1, segW - 1), 12).fill({ color: lit ? col : 0x1e1e1e }).stroke({ color: 0x0, width: 0.5 });
    }
    h.text("enHullT", `${Math.max(0, en.hull)}`, x + 248, y + 16, style(12, 0xffffff, "700"));
    const s1 = texNow("combatUI/box_hostiles_shield1.png");
    const s2 = texNow("combatUI/box_hostiles_shield2.png");
    const sh = en.systems.shields;
    const max = sh ? Math.floor(usable(sh) / 2) : 0;
    for (let i = 0; i < Math.max(max, en.shieldLayers); i++) {
      if (s1 && s2) h.sprite(`enS${i}`, i < en.shieldLayers ? s2 : s1, x + i * 24, y + 36);
      else g.circle(x + 10 + i * 24, y + 46, 9).fill({ color: i < en.shieldLayers ? 0x4aa8ff : 0x1c2a3a }).stroke({ color: 0x6fc0ff, width: 2 });
    }
    h.text("enEv", `EVASION ${en.evasion}%`, x + 248, y + 40, style(11, 0xcfd6e2, "700"), [1, 0]);
    const note = en.interior ? (en.weaponsKnown ? "" : "Sensors 3: weapon charge") : "Sensors 2: interior";
    if (note && v.winner === null) h.text("enNote", note, WIN.x + WIN.w - 26, WIN.y + WIN.h - 34, style(10, 0xa0a8b8), [1, 0]);
    if (en.weaponsKnown) {
      const bar = texNow("combatUI/box_hostiles_weapon_charge.png");
      en.weapons.forEach((w, i) => {
        const bx = WIN.x + WIN.w - 46 - i * 14;
        const by = y + 2;
        const bpw = this.db.weapons[w.bp];
        const k = w.volleys > 0 ? 1 : Math.min(1, Math.max(0, w.charge) / (bpw?.cooldown || 1));
        if (bar) h.sprite(`ewc${i}`, bar, bx, by);
        g.rect(bx + 2, by + 33 - 31 * k, 4, 31 * k).fill({ color: w.volleys > 0 ? 0xffd040 : w.powered ? 0x78ff78 : 0x777777 });
      });
    }
  }

  private crewList(s: ShipView): void {
    const h = this.hud;
    this.crewHit = [];
    let y = 168;
    const g = h.gfx("crewBoxes");
    for (const c of s.crew) {
      if (c.dead) continue;
      const sel = this.selected.has(c.id);
      g.roundRect(6, y, 132, 38, 3).fill({ color: sel ? 0x1f3b22 : 0x141820, alpha: 0.88 }).stroke({ color: sel ? 0x6fff6f : 0xdfe8e0, width: 2 });
      const race = this.db.animSheets[c.race] ? c.race : "human";
      const por = animFrame(this.db, `${race}_portrait`, 0) ?? animFrame(this.db, `${race}_walk_down`, 0);
      if (por) h.sprite(`cp${c.id}`, por, 8, y + 2);
      h.text(`cn${c.id}`, c.name, 44, y + 4, style(12, 0xffffff, "700"));
      const hp = c.hp / c.maxHp;
      g.rect(44, y + 24, 88, 7).fill({ color: 0x2a1010 }).rect(44, y + 24, 88 * hp, 7).fill({ color: hp > 0.5 ? 0x78ff78 : hp > 0.25 ? 0xffe050 : 0xff5040 });
      if (c.task !== "idle" && c.task !== "man") h.text(`ct${c.id}`, c.task === "fire" ? "🔥" : c.task === "walk" ? "→" : "🔧", 128, y + 3, style(10, 0xffffff), [1, 0]);
      this.crewHit.push({ id: c.id, box: { x: 6, y, w: 132, h: 38 } });
      y += 42;
    }
  }

  /**
   * Bottom-left power UI: reactor column on FTL's wire, then each system's bars above its icon.
   * Bars: green = powered, outline = free capacity, blue = ionised, red = damaged (fills yellow as it's
   * repaired), yellow-green = free power from a Zoltan.
   */
  private systemsBar(s: ShipView): void {
    const h = this.hud;
    this.sysHit = [];
    const wire = texNow("wireUI/wire_full.png");
    if (wire) h.sprite("wire", wire, 0, H - 340);
    const used = Object.values(s.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
    const free = s.reactor - used;
    const g = h.gfx("bars");
    const reactorBottom = H - 50;
    for (let i = 0; i < s.reactor; i++) {
      const yy = reactorBottom - i * (BAR_H + 2);
      g.rect(14, yy, BAR_W + 6, BAR_H).fill({ color: i < free ? 0x78ff78 : 0x0d1a0d }).stroke({ color: 0x78ff78, width: 1, alpha: i < free ? 1 : 0.35 });
    }
    const systems = SYS_ORDER.map((id) => s.systems[id]).filter(Boolean) as NonNullable<ShipView["systems"][SystemId]>[];
    const wireCap = texNow("wireUI/wire_456_cap.png");
    if (wireCap) h.sprite("wireCap", wireCap, 46, H - 36, { w: Math.max(60, systems.length * SYS_DX + 30), h: 36 });
    systems.forEach((sys, i) => {
      const x = SYS_X0 + i * SYS_DX;
      const isSub = SUBSYSTEMS.includes(sys.id);
      const cap = usable(sys);
      const bonus = sys.bonus ?? 0;
      for (let b = 0; b < sys.level; b++) {
        const yy = SYS_ICON_Y - 26 - b * (BAR_H + 2);
        const damaged = b >= sys.level - sys.damage;
        const ion = !damaged && b >= cap;
        const powered = !damaged && !ion && b < (isSub ? cap : Math.min(cap, sys.power + bonus));
        const zoltan = powered && !isSub && b >= sys.power;
        if (damaged) {
          g.rect(x, yy, BAR_W, BAR_H).fill({ color: 0xd03a2a });
          // The lowest damaged bar shows repair progress.
          if (b === sys.level - sys.damage && sys.repair > 0) g.rect(x, yy, BAR_W * sys.repair, BAR_H).fill({ color: 0xffe050 });
        } else if (ion) g.rect(x, yy, BAR_W, BAR_H).fill({ color: 0x3a7fd0 });
        else if (powered) g.rect(x, yy, BAR_W, BAR_H).fill({ color: zoltan ? 0xd8ff50 : isSub ? 0xe8e8e8 : 0x78ff78 });
        else g.rect(x + 0.5, yy + 0.5, BAR_W - 1, BAR_H - 1).stroke({ color: 0xdfe8e0, width: 1 });
      }
      const state = sys.damage >= sys.level ? "red" : sys.damage > 0 ? "orange" : sys.ion > 0 ? "blue" : sys.power + bonus === 0 && !isSub ? "grey" : "green";
      const icon = texNow(`icons/s_${sys.id}_${state}1.png`) ?? texNow(`icons/s_${sys.id}_green1.png`);
      if (icon) h.sprite(`si${sys.id}`, icon, x + BAR_W / 2, SYS_ICON_Y, { anchor: 0.5, scale: 0.62 });
      else h.text(`si${sys.id}`, sys.id.slice(0, 3).toUpperCase(), x + BAR_W / 2, SYS_ICON_Y, style(10, 0xffffff, "700"), [0.5, 0.5]);
      this.sysHit.push({ id: sys.id, box: { x: x - 10, y: SYS_ICON_Y - 30 - sys.level * (BAR_H + 2), w: BAR_W + 20, h: sys.level * (BAR_H + 2) + 50 } });
    });
    // Door control button (open all / close all).
    this.doorBtns = [];
    if (s.systems.doors) {
      const x = SYS_X0 + systems.length * SYS_DX + 8;
      const y = H - 92;
      const base = texNow("systemUI/button_door_base.png");
      if (base) {
        h.sprite("doorB", base, x, y);
        h.sprite("doorT", texNow("systemUI/button_door_top_on.png"), x, y);
        h.sprite("doorD", texNow("systemUI/button_door_bottom_on.png"), x, y);
      } else {
        g.roundRect(x, y, 40, 79, 4).stroke({ color: 0xdfe8e0, width: 2 });
        h.text("doorTx", "OPEN\n\nSHUT", x + 20, y + 40, style(9, 0xffffff, "700", "center"), [0.5, 0.5]);
      }
      this.doorBtns = [
        { open: true, box: { x, y, w: 40, h: 40 } },
        { open: false, box: { x, y: y + 40, w: 40, h: 39 } },
      ];
    }
  }

  private weaponsTray(s: ShipView): void {
    const h = this.hud;
    this.weapHit = [];
    const n = Math.max(2, Math.min(4, s.weapons.length));
    const boxT = texNow(`box_weapons_bottom${n}.png`);
    const x0 = 430;
    const y0 = WEAP_Y;
    const g = h.gfx("weap");
    if (boxT) h.sprite("wbox", boxT, x0, y0);
    else g.roundRect(x0 + 6, y0 + 6, 12 + n * 97, 76, 4).fill({ color: 0x2a1c26, alpha: 0.85 }).stroke({ color: 0xdfe8e0, width: 2 });
    const label = texNow("box_weapons_bottom_label.png");
    if (label) h.sprite("wlab", label, x0 + 8, y0 - 18);
    const ws = s.systems.weapons;
    if (label) h.text("wlabT", "WPN", x0 + 14, y0 - 13, style(10, 0x1a1a1a, "700"));
    if (ws) h.text("wpow", `WEAPONS ${Math.min(ws.power + (ws.bonus ?? 0), usable(ws))}/${usable(ws)}`, x0 + 64, y0 - 13, style(10, 0xb8c0cc, "700"));
    s.weapons.forEach((w, i) => {
      const bp = this.db.weapons[w.bp];
      const bx = x0 + 14 + i * 97;
      const by = y0 + 13;
      const armed = this.armed === i;
      const ready = w.powered && w.volleys > 0;
      const glow = texNow("bar_weapon_minibox_glow.png");
      if (ready && glow) h.sprite(`wg${i}`, glow, bx - 18, by - 12, { w: 125, h: 85, alpha: 0.55 + 0.25 * Math.sin(this.time * 6), tint: armed ? 0xffd040 : 0x78ff78 });
      g.roundRect(bx, by, 90, 58, 3).fill({ color: armed ? 0x4a3410 : 0x10141a, alpha: 0.9 }).stroke({ color: armed ? 0xffd040 : w.powered ? 0x78ff78 : 0x8a92a0, width: armed ? 3 : 1.5 });
      // Power pips down the left edge, then name and charge bar.
      for (let p = 0; p < (bp?.power ?? 1); p++) g.rect(bx + 4, by + 46 - p * 10, 8, 8).fill({ color: w.powered ? 0x78ff78 : 0x10141a }).stroke({ color: 0x78ff78, width: 1 });
      const title = (bp?.title ?? w.bp).replace("Mark ", "Mk ").replace("Laser", "Laser");
      h.text(`wn${i}`, title.length > 15 ? `${title.slice(0, 14)}…` : title, bx + 16, by + 5, style(10, w.powered ? (ready ? 0xffe070 : 0xffffff) : 0x8a92a0, "700"));
      const cd = bp?.cooldown ?? 1;
      const k = ready ? 1 : Math.min(1, Math.max(0, w.charge) / cd);
      // Charge: a row of lights that come on as the weapon readies.
      const lights = 10;
      for (let l = 0; l < lights; l++) {
        const on = l < Math.floor(k * lights + 1e-6);
        g.rect(bx + 16 + l * 7, by + 22, 5, 8).fill({ color: on ? (ready ? 0xffd040 : 0x78ff78) : 0x1d2a1d });
      }
      if (bp?.chargeLevels && bp.chargeLevels > 1) h.text(`wcl${i}`, `${w.volleys}/${bp.chargeLevels}`, bx + 86, by + 34, style(10, 0xffe070, "700"), [1, 0]);
      if (bp?.missiles) h.text(`wm${i}`, `${bp.missiles} msl`, bx + 16, by + 36, style(9, s.missiles >= bp.missiles ? 0xb8c0cc : 0xff6050));
      if (w.autofire) h.text(`wa${i}`, "AUTO", bx + 86, by + 46, style(9, 0xffd040, "700"), [1, 0]);
      this.weapHit.push({ slot: i, box: { x: bx, y: by, w: 90, h: 58 } });
    });
    // Autofire toggle for the armed weapon (or all weapons when none is armed).
    const ab = texNow("box_weapons_autofire_base.png");
    const ax = x0 + 14 + n * 97 + 6;
    const anyAuto = s.weapons.some((w) => w.autofire);
    if (ab) h.sprite("auto", ab, ax, y0 + 18, { tint: anyAuto ? 0xffd040 : 0xffffff });
    else g.roundRect(ax, y0 + 18, 34, 44, 4).stroke({ color: anyAuto ? 0xffd040 : 0xdfe8e0, width: 2 });
    h.text("autoT", "AUTO", ax + 17, y0 + 68, style(9, anyAuto ? 0xffd040 : 0xb8c0cc, "700"), [0.5, 0]);
    this.autoBox = { x: ax, y: y0 + 18, w: 37, h: 50 };
  }

  // ---------------------------------------------------------------- input

  private onDown(e: FederatedPointerEvent): void {
    const v = this.view;
    if (!v || v.winner !== null) return;
    const p = this.stage.toLocal(e.global);
    const right = e.button === 2;
    const own = v.ships[v.you];
    for (const s of this.sysHit) {
      if (!inBox(p, s.box)) continue;
      if (!SUBSYSTEMS.includes(s.id)) this.powerClick(own, s.id, right ? -1 : 1);
      return;
    }
    for (const b of this.doorBtns) {
      if (!inBox(p, b.box)) continue;
      this.send({ c: "doorsAll", open: b.open });
      play(this.db, [b.open ? "doorOpen" : "doorClose"]);
      return;
    }
    if (this.autoBox && inBox(p, this.autoBox)) {
      const slots = this.armed !== null ? [this.armed] : own.weapons.map((_, i) => i);
      const on = !(this.armed !== null ? own.weapons[this.armed].autofire : own.weapons.some((w) => w.autofire));
      for (const slot of slots) this.send({ c: "autofire", slot, on });
      play(this.db, [on ? "autofireOn" : "autofireOff"]);
      return;
    }
    for (const w of this.weapHit) if (inBox(p, w.box)) return this.clickWeapon(w.slot, right);
    for (const c of this.crewHit) {
      if (!inBox(p, c.box)) continue;
      if (!e.shiftKey) this.selected.clear();
      this.selected.add(c.id);
      return;
    }
    const ep = this.enemy.root.toLocal(e.global);
    const eh = inBox(p, WIN) ? this.enemy.pick(ep.x, ep.y) : { room: -1, door: -1 };
    if (this.armed !== null) {
      if (right) return this.disarm();
      const bp = this.db.weapons[own.weapons[this.armed].bp];
      if (bp?.type === "BEAM") {
        if (!this.beamStart) {
          if (eh.room >= 0) this.beamStart = { x: ep.x, y: ep.y };
          return;
        }
        const t: WeaponTarget = { kind: "beam", x1: this.beamStart.x, y1: this.beamStart.y, x2: ep.x, y2: ep.y };
        this.send({ c: "target", slot: this.armed, target: t });
        return this.disarm();
      }
      if (eh.room >= 0) {
        this.send({ c: "target", slot: this.armed, target: { kind: "room", room: eh.room } });
        return this.disarm();
      }
      return;
    }
    const op = this.own.root.toLocal(e.global);
    const oh = this.own.pick(op.x, op.y);
    if (right) {
      if (oh.room >= 0 && this.selected.size) this.send({ c: "moveCrew", crew: [...this.selected], room: oh.room });
      return;
    }
    if (oh.door >= 0) {
      const open = !own.doors[oh.door];
      this.send({ c: "door", door: oh.door, open });
      play(this.db, [open ? "doorOpen" : "doorClose"]);
      return;
    }
    const hit = own.crew.find((c) => !c.dead && Math.hypot(c.x + 0.5 - op.x / 35, c.y + 0.5 - op.y / 35) < 0.45);
    if (hit) {
      if (!e.shiftKey) this.selected.clear();
      this.selected.add(hit.id);
      return;
    }
    this.drag = { x: p.x, y: p.y, x2: p.x, y2: p.y };
  }

  /** Predict whether the power change will succeed, for instant FTL click sounds; the server decides. */
  private powerClick(own: ShipView, id: SystemId, delta: 1 | -1): void {
    const s = own.systems[id];
    if (!s) return;
    const used = Object.values(own.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
    const ok = delta > 0 ? used < own.reactor && s.power < usable(s) : s.power > 0;
    play(this.db, [ok ? (delta > 0 ? "powerUpSystem" : "powerDownSystem") : "powerUpFail"]);
    if (ok) this.send({ c: "power", system: id, delta });
  }

  private onMove(e: FederatedPointerEvent): void {
    const p = this.stage.toLocal(e.global);
    if (this.drag) {
      this.drag.x2 = p.x;
      this.drag.y2 = p.y;
    }
    if (!this.own) return;
    const op = this.own.root.toLocal(e.global);
    const ep = this.enemy.root.toLocal(e.global);
    const ph = this.own.pick(op.x, op.y);
    this.hoverOwn = this.selected.size ? ph : { room: -1, door: ph.door };
    this.hoverEnemy = inBox(p, WIN) ? this.enemy.pick(ep.x, ep.y) : { room: -1, door: -1 };
  }

  private onUp(e: FederatedPointerEvent): void {
    const v = this.view;
    if (!this.drag || !v) return;
    const d = this.drag;
    this.drag = null;
    if (Math.hypot(d.x2 - d.x, d.y2 - d.y) < 6) {
      if (!e.shiftKey) this.selected.clear();
      return;
    }
    const a = this.own.root.toLocal({ x: Math.min(d.x, d.x2), y: Math.min(d.y, d.y2) }, this.stage);
    const b = this.own.root.toLocal({ x: Math.max(d.x, d.x2), y: Math.max(d.y, d.y2) }, this.stage);
    if (!e.shiftKey) this.selected.clear();
    for (const c of v.ships[v.you].crew) {
      const cx = (c.x + 0.5) * 35;
      const cy = (c.y + 0.5) * 35;
      if (!c.dead && cx >= a.x && cx <= b.x && cy >= a.y && cy <= b.y) this.selected.add(c.id);
    }
  }

  private clickWeapon(slot: number, right: boolean): void {
    const own = this.view!.ships[this.view!.you];
    const w = own.weapons[slot];
    if (!w) return;
    const bp = this.db.weapons[w.bp];
    if (right) {
      if (w.powered) {
        this.send({ c: "weaponPower", slot, on: false });
        play(this.db, ["powerDownSystem"]);
      }
      if (this.armed === slot) this.disarm();
      return;
    }
    if (!w.powered) {
      const ws = own.systems.weapons;
      const load = own.weapons.filter((q) => q.powered).reduce((a, q) => a + (this.db.weapons[q.bp]?.power ?? 1), 0);
      const ok = !!ws && load + (bp?.power ?? 1) <= usable(ws);
      play(this.db, [ok ? "powerUpSystem" : "powerUpFail"]);
      return this.send({ c: "weaponPower", slot, on: true });
    }
    if (this.armed === slot) {
      this.send({ c: "target", slot, target: null });
      return this.disarm();
    }
    this.armed = slot;
    this.beamStart = null;
  }

  private disarm(): void {
    this.armed = null;
    this.beamStart = null;
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    const v = this.view;
    if (!v) return;
    const own = v.ships[v.you];
    if (/^[1-4]$/.test(e.key)) this.clickWeapon(Number(e.key) - 1, false);
    else if (e.key === "Escape") this.disarm();
    else if (e.key.toLowerCase() === "a" && this.armed !== null) this.send({ c: "autofire", slot: this.armed, on: !own.weapons[this.armed].autofire });
    else if (e.key.toLowerCase() === "m") setSound(!soundOn());
    else if (e.key.toLowerCase() === "z") this.send({ c: "doorsAll", open: true });
    else if (e.key.toLowerCase() === "x") this.send({ c: "doorsAll", open: false });
    else if (e.key === "Tab") {
      e.preventDefault();
      this.selected = new Set(own.crew.filter((c) => !c.dead).map((c) => c.id));
    }
  }
}

export const LOGICAL = { W, H };
