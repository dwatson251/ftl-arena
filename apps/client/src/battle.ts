/**
 * The combat screen, laid out on FTL's 1280×720 combat view. Positions of FTL's own UI pieces were
 * measured from real screenshots (tools/align/match.py); text uses FTL's bitmap fonts (ftlfonts.ts).
 * Everything the player does becomes a Command; everything drawn comes from server snapshots.
 *
 * Shots: a shot flies straight out of its weapon and off its own ship's view, vanishes, and a moment later
 * enters the other view from a varying angle and flies to the target.
 */
import { Application, Container, FederatedPointerEvent, Graphics, Sprite } from "pixi.js";
import type { GameDB, SystemId } from "@ftl/data";
import { SUBSYSTEMS } from "@ftl/data";
import { RULES, SNAP_HZ, usable, type Command, type MatchView, type ShipView, type WeaponTarget } from "./simlite.ts";
import { animFrame, texNow } from "./assets.ts";
import { play, setSound, soundOn } from "./audio.ts";
import { fstyle, Imm } from "./imm.ts";
import { ShipRenderer, type CrewDraw } from "./render/ship.ts";

const W = 1280;
const H = 720;
/** Own-ship view: the ship is centred where FTL centres the player's ship. */
const OWN = { cx: 467, cy: 346, w: 700, h: 470, clipX: 868 };
/** FTL's hostiles window (box_hostiles2) and the part of it the enemy ship is fitted into. */
const WIN = { x: 870, y: 45, w: 410, h: 555 };
const WIN_SHIP = { x: WIN.x + 18, y: WIN.y + 104, w: 366, h: 372 };
const MAIN_SYS: SystemId[] = ["shields", "engines", "medbay", "oxygen", "weapons"];
const SUB_SYS: SystemId[] = ["pilot", "sensors", "doors"];
/** Bottom-left system icons: s_<sys>_*1.png (64 px) top-left corners, 36 px apart. */
const SYS_X0 = 58;
const SYS_ICON_Y = 651;
const SYS_DX = 36;
/** Subsystems, bottom right. */
const SUB_X0 = 1015;
const SUB_ICON_Y = 633;
const BAR_W = 17;
const BAR_H = 7;
const BAR_PITCH = 9;
/** Weapons tray (box_weapons_bottomN) and its slot boxes. */
const TRAY = { x: 234, y: 607 };
const SLOT = { x: 251, y: 623, w: 94, h: 38, dx: 97 };
const LABEL_DARK = 0x0e1e24;
const LABEL_LIGHT = 0xe2ece8;

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
  private firedAt = new Map<string, number>();
  private shieldHitAt: [number, number] = [-9, -9];
  private walking = new Map<number, string>();
  private flashTiles = new Map<string, number>();
  private explodedAt = new Map<number, number>();
  private endReadyAt: number | null = null;
  private hullMaskSprite: Sprite | null = null;
  onEndReady: () => void = () => {};

  constructor(private app: Application, private db: GameDB, private send: (c: Command) => void, public you: 0 | 1) {
    this.hud = new Imm(this.hudRoot);
    const ownClip = new Graphics().rect(0, 0, OWN.clipX, H).fill({ color: 0xffffff });
    const ownProj = new Container();
    ownProj.addChild(this.projOwn, this.fxOwn);
    ownProj.mask = ownClip;
    this.winLayer.addChild(this.enemyBox, this.projWin, this.fxWin);
    this.world.addChild(this.ownBox, ownClip, ownProj, this.winLayer);
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
    // Player hulls face right, so in the hostiles window they're stood up (rotated -90°). Single-player
    // enemy hulls are already vertical art.
    const enemyNative = !!this.db.ships[en.bp]?.enemy;
    this.enemy = new ShipRenderer(this.db, en.bp, true, enemyNative ? 0 : Math.PI / 2);
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
    const at = this.world.getChildIndex(this.winLayer);
    if (frameTex) {
      const f = new Sprite(frameTex);
      f.position.set(WIN.x, WIN.y);
      f.tint = 0xffb4b4; // FTL tints the window red for a hostile ship
      this.world.addChildAt(f, at);
    } else {
      this.world.addChildAt(new Graphics().roundRect(WIN.x + 10, WIN.y + 25, WIN.w - 20, WIN.h - 30, 8).fill({ color: 0x4a2a2e, alpha: 0.85 }).stroke({ color: 0xf0c8c8, width: 3 }), at);
    }
    // The inside of box_hostiles_mask as a polygon (Pixi sprite masks read red×alpha; the art is black).
    const X = WIN.x;
    const Y = WIN.y;
    const mask = new Graphics()
      .poly([X + 14, Y + 29, X + 380, Y + 29, X + 389, Y + 38, X + 389, Y + 520, X + 375, Y + 520, X + 375, Y + 532, X + 58, Y + 532, X + 14, Y + 488])
      .fill({ color: 0xffffff });
    this.world.addChild(mask);
    this.winLayer.mask = mask;
    this.fit(enemyNative);
  }

  private fit(enemyNative: boolean): void {
    const o = this.own.bounds();
    const s = Math.min(1, OWN.w / o.w, OWN.h / o.h);
    this.own.root.scale.set(s);
    this.own.root.position.set(OWN.cx - (o.x + o.w / 2) * s, OWN.cy - (o.y + o.h / 2) * s);
    const e = this.enemy.bounds();
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const tx = WIN_SHIP.x + WIN_SHIP.w / 2;
    const ty = WIN_SHIP.y + WIN_SHIP.h / 2;
    if (enemyNative) {
      const se = Math.min(1, WIN_SHIP.w / e.w, WIN_SHIP.h / e.h);
      this.enemy.root.scale.set(se);
      this.enemy.root.position.set(tx - cx * se, ty - cy * se);
    } else {
      // Rotated -90°: local (x, y) maps to (y, -x) × scale, so the hull's width becomes the height.
      const se = Math.min(0.85, WIN_SHIP.w / e.h, WIN_SHIP.h / e.w);
      this.enemy.root.scale.set(se);
      this.enemy.root.rotation = -Math.PI / 2;
      this.enemy.root.position.set(tx - cy * se, ty + cx * se);
    }
  }

  onSnapshot(v: MatchView): void {
    if (!this.view) this.setupShips(v);
    this.prev = this.view ?? v;
    this.view = v;
    this.snapAt = performance.now();
    for (const e of v.events) this.onEvent(e);
    const own = v.ships[v.you];
    for (const id of [...this.selected]) if (!own.crew.find((c) => c.id === id && !c.dead)) this.selected.delete(id);
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

  private boom(ship: number, x: number, y: number, size: number): void {
    const p = this.at(ship, x, y);
    const c = new Container();
    c.position.copyFrom(p);
    const sp = new Sprite();
    sp.anchor.set(0.5);
    sp.scale.set(size * 1.6);
    const fallback = new Graphics().circle(0, 0, 14 * size).fill({ color: 0xffb040 });
    c.addChild(sp, fallback);
    this.addFx(this.fxLayerOf(ship), c, 0.75, (k) => {
      const f = animFrame(this.db, "explosion1", Math.floor(k * 10));
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
    im.text("t", s, 0, 0, fstyle("HL2", color, { stroke: 0x101010, strokeWidth: 3 }), [0.5, 0.5]);
    im.end();
    c.position.copyFrom(p);
    this.addFx(this.fxLayerOf(ship), c, 0.9, (k) => {
      c.y = p.y - 30 * k;
      c.alpha = 1 - k;
    });
  }

  /** A missed shot keeps flying past the target, in the direction it came in. */
  private lastInbound = new Map<number, number>();
  private missFly(ship: number, x: number, y: number): void {
    const p = this.at(ship, x, y);
    const ang = this.lastInbound.get(ship) ?? (ship === this.view!.you ? Math.PI : 0);
    const g = new Graphics().roundRect(-10, -2.5, 20, 5, 2).fill({ color: 0xff7050 });
    g.position.copyFrom(p);
    g.rotation = ang;
    this.addFx(this.fxLayerOf(ship), g, 0.6, (k) => {
      g.x = p.x + Math.cos(ang) * 320 * k;
      g.y = p.y + Math.sin(ang) * 320 * k;
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

  private explode(ship: number): void {
    this.explodedAt.set(ship, this.time);
    const b = this.rOf(ship).bounds();
    for (let i = 0; i < 9; i++) {
      setTimeout(() => {
        if (!this.view) return;
        this.boom(ship, b.x + b.w * (0.15 + 0.7 * hash01(i * 3 + ship)), b.y + b.h * (0.2 + 0.6 * hash01(i * 7 + ship)), 1.6 + hash01(i) * 1.2);
        if (i % 3 === 0) play(this.db, ["explosion1", "explosion2", "explosion3", "explosion4"]);
      }, i * 160);
    }
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
    const eng = (s: ShipView) => {
      const e = s.systems.engines;
      return e ? Math.max(0, Math.min(e.power + (e.bonus ?? 0), usable(e))) : 0;
    };
    this.own.update(ownV, this.crewDraw(ownV, this.prev?.ships[v.you], k, true), this.time, {
      hover: this.hoverOwn, weaponFrame: (s) => this.weaponFrameFor(ownV, v.you, s), shieldFlash: this.time - this.shieldHitAt[v.you],
      exploded: ex(v.you), destinations: true, flashTiles: this.flashTiles, engines: eng(ownV),
    });
    this.enemy.update(enV, this.crewDraw(enV, this.prev?.ships[1 - v.you], k, false), this.time, {
      hover: this.armed !== null ? this.hoverEnemy : { room: -1, door: -1 }, weaponFrame: (s) => this.weaponFrameFor(enV, (1 - v.you) as 0 | 1, s),
      shieldFlash: this.time - this.shieldHitAt[1 - v.you], exploded: ex(1 - v.you), engines: enV.weaponsKnown ? eng(enV) : 1,
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
    if (w.charge < 0) return 0;
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

  /**
   * FTL's numbered reticles (misc/crosshairs_placedN.png), all centred on the targeted room; the armed
   * weapon's reticle is the yellow variant. Beams draw FTL's beam line.
   */
  private drawTargets(own: ShipView): void {
    const g = this.enemy.overlay.clear();
    const mk = this.enemy.marks;
    mk.begin();
    own.weapons.forEach((w, i) => {
      if (!w.target) return;
      const yellow = this.armed === i;
      if (w.target.kind === "room") {
        const r = this.enemy.layout.rooms.find((q) => q.id === (w.target as { room: number }).room);
        if (!r) return;
        const cx = (r.x + r.w / 2) * 35;
        const cy = (r.y + r.h / 2) * 35;
        const t = texNow(`misc/crosshairs_placed${i + 1}${yellow ? "_yellow" : ""}.png`);
        if (t) mk.sprite(`x${i}`, t, cx, cy, { anchor: 0.5, rotation: this.enemy.upright });
        else {
          g.circle(cx, cy, 11).stroke({ color: yellow ? 0xffd040 : 0xff4040, width: 2.5 });
          mk.text(`xn${i}`, String(i + 1), cx + 14, cy - 14, fstyle("JustinFont10", 0xff4040), [0.5, 0.5], this.enemy.upright);
        }
      } else {
        const t = w.target;
        const L = this.db.weapons[w.bp]?.length || 60;
        const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1) || 1;
        g.moveTo(t.x1, t.y1).lineTo(t.x1 + ((t.x2 - t.x1) / len) * L, t.y1 + ((t.y2 - t.y1) / len) * L).stroke({ color: yellow ? 0xffd040 : 0xff5050, width: 3, alpha: 0.85 });
        mk.text(`xn${i}`, String(i + 1), t.x1 + 8, t.y1 - 8, fstyle("JustinFont10", 0xff6050, { stroke: 0x101010 }), [0.5, 0.5], this.enemy.upright);
      }
    });
    if (this.beamStart && this.armed !== null) g.circle(this.beamStart.x, this.beamStart.y, 6).fill({ color: 0xffd040 });
    mk.end();
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
      // Phases: out of the source view (first 35 % of the flight), a gap, then into the target view.
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
      if (k1 <= 1) {
        // Straight out of the barrel, along the weapon's own facing, until it leaves this view.
        const slotBp = v.ships[p.from].weapons[p.slot]?.bp ?? p.weapon;
        const base = this.stage.toLocal(src.root.toGlobal(src.mountPoint(p.slot)));
        const muzzle = this.stage.toLocal(src.root.toGlobal(src.muzzlePoint(p.slot, slotBp)));
        let dx = muzzle.x - base.x;
        let dy = muzzle.y - base.y;
        const d = Math.hypot(dx, dy);
        if (d < 1) [dx, dy] = mine ? [1, 0] : [0, -1];
        else [dx, dy] = [dx / d, dy / d];
        const dist = 900 * k1;
        this.drawShot(mine ? this.projOwn : this.projWin, bp?.image, muzzle.x + dx * dist, muzzle.y + dy * dist, Math.atan2(dy, dx), p.kind, 1);
      } else if (k2 >= 0) {
        // Into the target view from a varying angle: from the left half for the hostiles window,
        // from the right half for our own ship.
        const spread = (hash01(p.id) - 0.5) * (Math.PI * 0.75);
        const ang = (mine ? Math.PI : 0) + spread;
        const kk = Math.min(1, k2);
        const R = 520 * (1 - kk);
        const x = target.x + Math.cos(ang) * R;
        const y = target.y + Math.sin(ang) * R;
        const heading = ang + Math.PI;
        this.lastInbound.set(mine ? 1 - v.you : v.you, heading);
        this.drawShot(mine ? this.projWin : this.projOwn, bp?.image, x, y, heading, p.kind, 1);
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
    this.target(en, v);
    this.crewList(own);
    this.systemsBar(own);
    this.subsystems(own);
    this.weaponsTray(own);
    if (this.armed !== null) {
      const bp = this.db.weapons[own.weapons[this.armed]?.bp];
      if (bp?.type === "BEAM") h.text("hint", this.beamStart ? "Click to aim the beam" : "Click where the beam starts", OWN.cx, 588, fstyle("JustinFont10", 0xffd27a, { stroke: 0x101010 }), [0.5, 0]);
    }
    if (v.config.timeLimit > 0) {
      const left = Math.max(0, v.config.timeLimit - v.tick / 30);
      h.text("clock", `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`, 640, 8, fstyle("HL2", 0xffffff, { stroke: 0x101010 }), [0.5, 0]);
    }
    h.end();
  }

  /** An FTL outlined label (HL2, dark letters with a light outline). */
  /** FTL's big labels are HL2 at 2× with a 2 px light outline. */
  private label(key: string, s: string, x: number, y: number, dark = LABEL_DARK, light = LABEL_LIGHT, anchor: [number, number] = [0, 0], scale = 2): void {
    this.hud.text(key, s, x, y, fstyle("HL2", dark, { scale, stroke: light, strokeWidth: scale }), anchor);
  }

  /** Top left, at FTL's positions: hull frame + segments, shields panel, missiles, evade/O2. */
  private topLeft(s: ShipView): void {
    const h = this.hud;
    const ratio = s.hull / s.maxHull;
    const low = ratio <= 0.33;
    const frameT = texNow(low ? "statusUI/top_hull_red.png" : "statusUI/top_hull.png");
    const mask = texNow("statusUI/top_hull_bar_mask.png");
    const col = ratio > 0.66 ? 0x78ff78 : ratio > 0.33 ? 0xffe050 : 0xff5040;
    if (frameT && mask) {
      h.sprite("hullF", frameT, 0, 0);
      h.sprite("hullEmpty", mask, 8, 0, { tint: 0x1a1a1a, alpha: 0.85 });
      const g = h.gfx("hullSeg");
      const lit = Math.round(ratio * 30);
      for (let i = 0; i < lit; i++) g.rect(8 + i * 12, 0, 11, 65).fill({ color: col });
      if (!this.hullMaskSprite) {
        this.hullMaskSprite = new Sprite(mask);
        this.hullMaskSprite.position.set(8, 0);
        this.hudRoot.addChild(this.hullMaskSprite);
      }
      g.mask = this.hullMaskSprite;
    } else {
      const g = h.gfx("hullSeg");
      for (let i = 0; i < s.maxHull; i++) g.rect(10 + i * 12, 25, 11, 16).fill({ color: i < s.hull ? col : 0x2a2a2a });
    }
    // The HULL tab: FTL's light label shape behind dark lettering.
    const tab = texNow(low ? "statusUI/top_hull_red_label.png" : "statusUI/top_hull_label.png");
    if (tab) h.sprite("hullTab", tab, 0, 0, { w: 84, h: 30 });
    h.text("hullT", "HULL", 8, 5, fstyle("HL2", LABEL_DARK, { scale: 2 }));
    // Shields: the panel, a square per layer (lit when up), and the blue recharge bar under it.
    const sh = s.systems.shields;
    const max = sh ? Math.floor(Math.min(sh.power + (sh.bonus ?? 0), usable(sh)) / 2) : 0;
    const panel = texNow("statusUI/top_shields4_on.png");
    const on = texNow("statusUI/top_shieldsquare1_on.png");
    const off = texNow("statusUI/top_shieldsquare1_off.png");
    if (panel) h.sprite("shP", panel, 0, 43);
    const g = h.gfx("shBar");
    for (let i = 0; i < Math.max(max, s.shieldLayers); i++) {
      const x = 30 + i * 22;
      if (on && off) h.sprite(`shS${i}`, i < s.shieldLayers ? on : off, x, 47);
      else g.roundRect(x + 4, 51, 20, 20, 4).fill({ color: i < s.shieldLayers ? 0x2a7bff : 0x101820 }).stroke({ color: 0x6fc0ff, width: 2 });
    }
    // The blue bar only shows while a layer is recharging.
    if (s.shieldLayers < max && s.shieldCharge > 0) g.rect(32, 78, 90 * s.shieldCharge, 6).fill({ color: 0x2a7bff });
    // Missiles (FTL's fuel slot is unused in the arena, so missiles take its place).
    const mt = texNow(s.missiles > 0 ? "statusUI/top_missiles_on.png" : "statusUI/top_missiles_on_red.png");
    if (mt) h.sprite("msl", mt, 122, 43);
    h.text("mslT", String(s.missiles), 174, 45, fstyle("num_font", s.missiles > 0 ? 0xffffff : 0xff6050), [0.5, 0]);
    // Evasion and oxygen
    const o2 = Math.round(s.rooms.reduce((a, r) => a + r.o2, 0) / s.rooms.length);
    const evRed = s.evasion === 0;
    const o2Red = o2 < 25;
    const eo = texNow(evRed && o2Red ? "statusUI/top_evade_oxygen_both_red.png" : evRed ? "statusUI/top_evade_oxygen_up_red.png" : o2Red ? "statusUI/top_evade_oxygen_down_red.png" : "statusUI/top_evade_oxygen.png");
    if (eo) h.sprite("eo", eo, 1, 89);
    h.text("evT", `${s.evasion}%`, 94, 95, fstyle("JustinFont11Bold", 0xffffff), [1, 0]);
    h.text("o2T", `${o2}%`, 94, 116, fstyle("JustinFont11Bold", o2Red ? 0xff8070 : 0xffffff), [1, 0]);
  }

  /** The hostiles window header (TARGET, hull, shields, class) and its row of enemy system icons. */
  private target(en: ShipView, v: MatchView): void {
    const h = this.hud;
    const x = WIN.x;
    const y = WIN.y;
    const pink = 0xe8a8a8;
    const g = h.gfx("tgt");
    // TARGET on the window's top band.
    this.label("tgtT", "TARGET", x + 17, y + 8, 0x5a2a2e, 0xf6d4d4);
    // HULL tab + segments, SHIELDS tab + squares.
    g.poly([x + 14, y + 33, x + 62, y + 33, x + 70, y + 41, x + 62, y + 47, x + 14, y + 47]).fill({ color: pink });
    h.text("tgtHullL", "HULL", x + 18, y + 33, fstyle("HL1", 0x5a2a2e, { stroke: 0xf6d4d4, strokeWidth: 2 }));
    const segs = en.maxHull;
    const segW = Math.max(3, Math.min(10, Math.floor(160 / segs)));
    const ratio = en.hull / en.maxHull;
    const col = ratio > 0.66 ? 0x78ff78 : ratio > 0.33 ? 0xffe050 : 0xff5040;
    for (let i = 0; i < segs; i++) g.rect(x + 18 + i * segW, y + 51, segW - 1, 8).fill({ color: i < en.hull ? col : 0x3a1a1c });
    g.poly([x + 14, y + 62, x + 62, y + 62, x + 70, y + 70, x + 62, y + 76, x + 14, y + 76]).fill({ color: pink });
    h.text("tgtShL", "SHIELDS", x + 18, y + 62, fstyle("HL1", 0x5a2a2e, { stroke: 0xf6d4d4, strokeWidth: 2 }));
    const s1 = texNow("combatUI/box_hostiles_shield1.png");
    const s2 = texNow("combatUI/box_hostiles_shield2.png");
    const sh = en.systems.shields;
    const max = sh ? Math.floor(usable(sh) / 2) : 0;
    for (let i = 0; i < Math.max(max, en.shieldLayers); i++) {
      if (s1 && s2) h.sprite(`enS${i}`, i < en.shieldLayers ? s2 : s1, x + 22 + i * 24, y + 75);
      else g.roundRect(x + 22 + i * 24, y + 78, 18, 18, 4).fill({ color: i < en.shieldLayers ? 0x2a7bff : 0x101820 }).stroke({ color: 0xffffff, width: 2 });
    }
    const bp = this.db.ships[en.bp];
    h.text("tgtClass", `Class: ${bp?.className?.split(" · ")[0] || bp?.title || en.bp}`, x + 382, y + 37, fstyle("JustinFont10", 0xffffff), [1, 0]);
    h.text("tgtRel", `Captain: ${en.player}`, x + 382, y + 53, fstyle("JustinFont10", 0xff5a50), [1, 0]);
    h.text("tgtEv", `Evasion ${en.evasion}%`, x + 382, y + 69, fstyle("JustinFont8", 0xe8d0d0), [1, 0]);
    // Weapon charge bars (sensors 3): charging fills white, ready turns green.
    if (en.weaponsKnown) {
      en.weapons.forEach((w, i) => {
        const bpw = this.db.weapons[w.bp];
        const k = w.volleys > 0 ? 1 : Math.min(1, Math.max(0, w.charge) / (bpw?.cooldown || 1));
        const bx = x + 296 + i * 22;
        const by = y + 84;
        const bar = texNow("combatUI/box_hostiles_weapon_charge.png");
        if (bar) h.sprite(`ewc${i}`, bar, bx, by);
        else g.rect(bx, by, 8, 35).stroke({ color: 0xffffff, width: 1 });
        g.rect(bx + 2, by + 33 - 31 * k, 4, 31 * k).fill({ color: w.volleys > 0 ? 0x78ff78 : w.powered ? 0xe8e8e8 : 0x707070 });
      });
    }
    // Enemy systems along the bottom of the window.
    const order: SystemId[] = ["pilot", "oxygen", "shields", "engines", "weapons", "medbay", "sensors", "doors"];
    order.filter((id) => en.systems[id]).forEach((id, i) => {
      const s = en.systems[id]!;
      const state = s.damage >= s.level ? "red" : s.damage > 0 ? "orange" : s.ion > 0 ? "blue" : en.weaponsKnown && s.power === 0 && !SUBSYSTEMS.includes(id) ? "grey" : "green";
      const t = texNow(`icons/s_${id}_${state}1.png`);
      if (t) h.sprite(`eic${id}`, t, x + 74 + i * 30, y + 502, { anchor: 0.5, scale: 0.85 });
    });

  }

  /** Crew boxes as in FTL: portrait, name, health bar; green when selected. */
  private crewList(s: ShipView): void {
    const h = this.hud;
    this.crewHit = [];
    const g = h.gfx("crewBoxes");
    let y = 155;
    for (const c of s.crew) {
      if (c.dead) continue;
      const sel = this.selected.has(c.id);
      g.rect(10, y, 86, 26).fill({ color: sel ? 0x24502c : 0x1a1f22, alpha: 0.95 }).stroke({ color: sel ? 0x78ff78 : 0x7c8686, width: 2 });
      const race = this.db.animSheets[c.race] ? c.race : "human";
      // Portrait with FTL's yellow outline (the race's silhouette sheet, tinted, slightly larger).
      const por = animFrame(this.db, `${race}_portrait`, 0) ?? animFrame(this.db, `${race}_walk_down`, 0);
      const sil = animFrame(this.db, `${race}_portrait`, 0, `people/${race}_color.png`);
      if (sil) h.sprite(`cps${c.id}`, sil, 27, y + 13, { anchor: 0.5, scale: 1.16, tint: 0xffe040 });
      if (por) h.sprite(`cp${c.id}`, por, 27, y + 13, { anchor: 0.5 });
      const long = c.name.length > 7;
      const nm = c.name.length > 9 ? `${c.name.slice(0, 8)}.` : c.name;
      h.text(`cn${c.id}`, nm, 44, y - 2, fstyle(long ? "JustinFont8" : "JustinFont10", sel ? 0xffffff : 0xe8ece8));
      const hp = Math.max(0, c.hp / c.maxHp);
      g.rect(44, y + 18, 46 * hp, 4).fill({ color: hp > 0.5 ? 0x78ff78 : hp > 0.25 ? 0xffe050 : 0xff5040 });
      this.crewHit.push({ id: c.id, box: { x: 10, y, w: 86, h: 26 } });
      y += 30;
    }
    // FTL's "save stations" and "return to stations" buttons.
    const base = texNow("statusUI/button_station_base.png");
    this.stationBtns = [];
    for (const [i, kind] of (["assign", "return"] as const).entries()) {
      const bx = 13 + i * 38;
      const by = y + 2;
      if (base) {
        h.sprite(`stB${i}`, base, bx, by);
        h.sprite(`stI${i}`, texNow(`statusUI/button_station_${kind}_on.png`), bx + 22, by + 22, { anchor: 0.5 });
      } else h.gfx(`stG${i}`).roundRect(bx + 6, by + 6, 32, 32, 4).stroke({ color: 0xe8ece8, width: 2 });
      this.stationBtns.push({ kind, box: { x: bx + 4, y: by + 4, w: 36, h: 36 } });
    }
  }

  private stationBtns: { kind: "assign" | "return"; box: Box }[] = [];
  /** Saved stations: crew id -> room. */
  private savedStations = new Map<number, number>();

  /** One system's power bars above its icon. Damaged bars are red, filling yellow while repaired. */
  private bars(key: string, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, bottom: number): void {
    const g = this.hud.gfx(key);
    const isSub = SUBSYSTEMS.includes(sys.id);
    const cap = usable(sys);
    const bonus = sys.bonus ?? 0;
    const x = cx - BAR_W / 2;
    for (let b = 0; b < sys.level; b++) {
      const yy = bottom - b * BAR_PITCH;
      const damaged = b >= sys.level - sys.damage;
      const ion = !damaged && b >= cap;
      const powered = !damaged && !ion && b < (isSub ? cap : Math.min(cap, sys.power + bonus));
      if (damaged) {
        g.rect(x, yy, BAR_W, BAR_H).fill({ color: 0xff3a2a });
        if (b === sys.level - sys.damage && sys.repair > 0) g.rect(x, yy, BAR_W * sys.repair, BAR_H).fill({ color: 0xffe050 });
      } else if (ion) g.rect(x, yy, BAR_W, BAR_H).fill({ color: 0x3a7fd0 });
      else if (powered) g.rect(x, yy, BAR_W, BAR_H).fill({ color: !isSub && b >= sys.power ? 0xd8ff50 : 0x78ff78 });
      else g.rect(x + 0.5, yy + 0.5, BAR_W - 1, BAR_H - 1).stroke({ color: 0xe8ece8, width: 1 });
    }
  }

  private iconState(sys: NonNullable<ShipView["systems"][SystemId]>): string {
    if (sys.damage >= sys.level) return "red";
    if (sys.damage > 0) return "orange";
    if (sys.ion > 0) return "blue";
    if (!SUBSYSTEMS.includes(sys.id) && sys.power + (sys.bonus ?? 0) === 0) return "grey";
    return "green";
  }

  /** Who mans a system (FTL draws a crew figure above its bars). */
  private manned(s: ShipView, id: SystemId): boolean {
    const sys = s.systems[id];
    return !!sys?.station && s.crew.some((c) => !c.dead && c.path.length === 0 && c.tile === sys.station);
  }

  /** Bottom left: reactor column on FTL's wire, then each main system's bars above its icon. */
  private systemsBar(s: ShipView): void {
    const h = this.hud;
    this.sysHit = [];
    const used = Object.values(s.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
    const free = s.reactor - used;
    const g = h.gfx("reactor");
    // Reactor: free power green from the bottom, used power as outlines; hatch and wire to the systems.
    const shown = Math.min(s.reactor, 10);
    for (let i = 0; i < shown; i++) {
      const yy = 686 - i * BAR_PITCH;
      if (i < free) g.rect(13, yy, 27, 6).fill({ color: 0x78ff78 });
      else g.rect(13.5, yy + 0.5, 26, 5).stroke({ color: 0xe8ece8, width: 1 });
    }
    if (s.reactor > 10) h.text("reacN", `${free}`, 26, 686 - 10 * BAR_PITCH - 12, fstyle("JustinFont8", 0x78ff78), [0.5, 0]);
    const systems = MAIN_SYS.map((id) => s.systems[id]).filter(Boolean) as NonNullable<ShipView["systems"][SystemId]>[];
    const right = SYS_X0 + 32 + (systems.length - 1) * SYS_DX + 20;
    for (let yy = 627; yy < 690; yy += 6) g.moveTo(44, yy + 6).lineTo(50, yy).stroke({ color: 0x8a948c, width: 2 });
    g.moveTo(46, 690).lineTo(58, 704).lineTo(right, 704).stroke({ color: 0xe8ece8, width: 2.5 });
    systems.forEach((sys, i) => {
      const cx = SYS_X0 + 32 + i * SYS_DX;
      g.moveTo(cx - 10, 704).lineTo(cx - 2, 696).stroke({ color: 0xe8ece8, width: 2 });
      this.bars(`b${sys.id}`, sys, cx, 657);
      if (this.manned(s, sys.id)) h.sprite(`mn${sys.id}`, texNow("systemUI/manning_white.png"), cx, 657 - sys.level * BAR_PITCH - 2, { anchor: [0.5, 1], scale: 0.7 });
      const icon = texNow(`icons/s_${sys.id}_${this.iconState(sys)}1.png`) ?? texNow(`icons/s_${sys.id}_green1.png`);
      if (icon) h.sprite(`si${sys.id}`, icon, SYS_X0 + i * SYS_DX, SYS_ICON_Y);
      else h.text(`si${sys.id}`, sys.id.slice(0, 3).toUpperCase(), cx, SYS_ICON_Y + 32, fstyle("JustinFont10", 0xffffff), [0.5, 0.5]);
      this.sysHit.push({ id: sys.id, box: { x: cx - 16, y: 657 - sys.level * BAR_PITCH - 4, w: 32, h: sys.level * BAR_PITCH + 60 } });
    });
  }

  /** Bottom right: piloting, sensors and doors with the SUBSYSTEMS tab and FTL's door button. */
  private subsystems(s: ShipView): void {
    const h = this.hud;
    const subs = SUB_SYS.map((id) => s.systems[id]).filter(Boolean) as NonNullable<ShipView["systems"][SystemId]>[];
    const tab = texNow("box_subsystems4.png");
    if (tab) h.sprite("subTab", tab, 1022, 664);
    else h.gfx("subTabG").roundRect(1024, 666, 165, 34, 4).fill({ color: 0xd8e4dc });
    this.label("subT", "SUBSYSTEMS", 1034, 669);
    subs.forEach((sys, i) => {
      const cx = SUB_X0 + 32 + i * SYS_DX;
      this.bars(`sb${sys.id}`, sys, cx, 639);
      if (this.manned(s, sys.id)) h.sprite(`smn${sys.id}`, texNow("systemUI/manning_white.png"), cx, 639 - sys.level * BAR_PITCH - 2, { anchor: [0.5, 1], scale: 0.7 });
      const icon = texNow(`icons/s_${sys.id}_${this.iconState(sys)}1.png`);
      if (icon) h.sprite(`ssi${sys.id}`, icon, SUB_X0 + i * SYS_DX, SUB_ICON_Y);
      else h.text(`ssi${sys.id}`, sys.id.slice(0, 3).toUpperCase(), cx, SUB_ICON_Y + 32, fstyle("JustinFont10", 0xffffff), [0.5, 0.5]);
    });
    this.doorBtns = [];
    if (s.systems.doors) {
      const bx = 1122;
      const by = 597;
      const base = texNow("systemUI/button_door_base.png");
      if (base) {
        h.sprite("doorB", base, bx, by);
        h.sprite("doorT", texNow("systemUI/button_door_top_on.png"), bx, by);
        h.sprite("doorD", texNow("systemUI/button_door_bottom_on.png"), bx, by);
      } else h.gfx("doorBG").roundRect(bx + 4, by + 4, 32, 70, 4).stroke({ color: 0xe8ece8, width: 2 });
      this.doorBtns = [
        { open: true, box: { x: bx, y: by, w: 40, h: 38 } },
        { open: false, box: { x: bx, y: by + 38, w: 40, h: 40 } },
      ];
    }
  }

  /**
   * FTL's weapons tray: one box per weapon slot with a thin vertical charge bar on the left, power bars at
   * the bottom left, the name centred (wrapping to two lines) and the slot number in the corner; the
   * WEAPONS label in the tray's tab and the AUTOFIRE button beside it.
   */
  private weaponsTray(s: ShipView): void {
    const h = this.hud;
    this.weapHit = [];
    const slots = Math.max(2, Math.min(4, this.db.ships[s.bp]?.weaponSlots ?? 4));
    const boxT = texNow(`box_weapons_bottom${slots}.png`);
    const g = h.gfx("weap");
    if (boxT) h.sprite("wbox", boxT, TRAY.x, TRAY.y);
    else g.roundRect(TRAY.x + 6, TRAY.y + 6, 20 + slots * SLOT.dx, 64, 4).fill({ color: 0x1a1f22, alpha: 0.9 }).stroke({ color: 0xe8ece8, width: 2 });
    this.label("wlabT", "WEAPONS", 252, 667);
    for (let i = 0; i < slots; i++) {
      const bx = SLOT.x + i * SLOT.dx;
      const by = SLOT.y;
      const w = s.weapons[i];
      if (!w) {
        g.rect(bx + 1, by + 1, SLOT.w - 2, SLOT.h - 2).stroke({ color: 0x8a8e8a, width: 2 });
        continue;
      }
      const bp = this.db.weapons[w.bp];
      const armed = this.armed === i;
      const ready = w.powered && w.volleys > 0;
      const edge = armed ? 0xffd040 : w.powered ? 0x78ff78 : 0x8a8e8a;
      if (ready) {
        const glow = texNow("bar_weapon_minibox_glow.png");
        if (glow) h.sprite(`wg${i}`, glow, bx - 17, by - 13, { w: SLOT.w + 34, h: SLOT.h + 26, tint: armed ? 0xffd040 : 0x78ff78, alpha: 0.55 });
      }
      g.rect(bx + 1, by + 1, SLOT.w - 2, SLOT.h - 2).fill({ color: armed ? 0x3a3010 : ready ? 0x1d3a1f : 0x0f1414, alpha: 0.9 }).stroke({ color: edge, width: 2 });
      // Charge: a thin vertical bar, filling steadily from the bottom.
      const cd = bp?.cooldown ?? 1;
      const k = ready ? 1 : Math.min(1, Math.max(0, w.charge) / cd);
      g.rect(bx + 4.5, by + 4.5, 5, SLOT.h - 9).stroke({ color: w.powered ? 0x78ff78 : 0x8a8e8a, width: 1 });
      if (k > 0) g.rect(bx + 5, by + 5 + (SLOT.h - 10) * (1 - k), 4, (SLOT.h - 10) * k).fill({ color: 0x78ff78 });
      // Power bars, bottom left, one per power the weapon needs.
      const pw = bp?.power ?? 1;
      for (let p = 0; p < pw; p++) {
        const py = by + SLOT.h - 11 - p * 8;
        if (w.powered) g.rect(bx + 12, py, 16, 6).fill({ color: 0x78ff78 });
        else g.rect(bx + 12.5, py + 0.5, 15, 5).stroke({ color: 0x8a8e8a, width: 1 });
      }
      const title = bp?.short ?? bp?.title ?? w.bp;
      h.text(`wn${i}`, title, bx + 54, by + 3, fstyle("JustinFont10", w.powered ? (ready ? 0xb8ffb8 : 0xffffff) : 0x9aa09a, { align: "center", wrap: 66 }), [0.5, 0]);
      if (bp?.chargeLevels && bp.chargeLevels > 1) h.text(`wcl${i}`, `${w.volleys}/${bp.chargeLevels}`, bx + 34, by + SLOT.h - 13, fstyle("JustinFont8", 0xffe070));
      if (bp?.missiles) h.text(`wm${i}`, `${bp.missiles}▸`, bx + 34, by + SLOT.h - 13, fstyle("JustinFont8", s.missiles >= bp.missiles ? 0xb8c0b8 : 0xff6050));
      // Slot number tag in the bottom-right corner.
      g.rect(bx + SLOT.w - 12, by + SLOT.h - 12, 11, 11).fill({ color: 0x0f1414 }).stroke({ color: edge, width: 1 });
      h.text(`wnum${i}`, String(i + 1), bx + SLOT.w - 6.5, by + SLOT.h - 12, fstyle("JustinFont8", 0xe8ece8), [0.5, 0]);
      if (w.autofire) h.text(`wa${i}`, "AUTO", bx + SLOT.w - 15, by + SLOT.h - 12, fstyle("JustinFont8", 0xffd040), [1, 0]);
      this.weapHit.push({ slot: i, box: { x: bx, y: by, w: SLOT.w, h: SLOT.h } });
    }
    // AUTOFIRE: a tab under the right end of the tray, lit when any weapon autofires.
    const anyAuto = s.weapons.some((w) => w.autofire);
    const ax = 527;
    const ay = 668;
    const ab = h.gfx("autoBtn");
    ab.poly([ax + 6, ay, ax + 112, ay, ax + 118, ay + 6, ax + 118, ay + 24, ax + 112, ay + 29, ax + 6, ay + 29, ax, ay + 24, ax, ay + 6])
      .fill({ color: anyAuto ? 0xd8e8b0 : 0x98a8a4 })
      .stroke({ color: anyAuto ? 0xfff2a0 : 0xd8e4dc, width: 2 });
    this.label("autoT", "AUTOFIRE", ax + 59, ay + 3, anyAuto ? 0x3a3a10 : 0x2a3434, anyAuto ? 0xfff8d0 : 0xc8d4d0, [0.5, 0]);
    this.autoBox = { x: ax, y: ay, w: 118, h: 29 };
    void soundOn;
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
      this.powerClick(own, s.id, right ? -1 : 1);
      return;
    }
    for (const b of this.doorBtns) {
      if (!inBox(p, b.box)) continue;
      this.send({ c: "doorsAll", open: b.open });
      play(this.db, [b.open ? "doorOpen" : "doorClose"]);
      return;
    }
    if (this.autoBox && inBox(p, this.autoBox)) {
      const on = !own.weapons.some((w) => w.autofire);
      own.weapons.forEach((_, slot) => this.send({ c: "autofire", slot, on }));
      play(this.db, [on ? "autofireOn" : "autofireOff"]);
      return;
    }
    for (const w of this.weapHit) if (inBox(p, w.box)) return this.clickWeapon(w.slot, right);
    for (const b of this.stationBtns) {
      if (!inBox(p, b.box)) continue;
      const g = this.own.geo;
      if (b.kind === "assign") {
        for (const c of own.crew) if (!c.dead) this.savedStations.set(c.id, g.tiles.get(c.home)!.room);
        play(this.db, ["powerUpSystem"]);
      } else {
        for (const [id, room] of this.savedStations) if (own.crew.find((c) => c.id === id && !c.dead)) this.send({ c: "moveCrew", crew: [id], room });
        play(this.db, [this.savedStations.size ? "powerUpSystem" : "powerUpFail"]);
      }
      return;
    }
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

  /** Predict the result for an instant FTL click sound; the server decides. Subsystems can't be powered. */
  private powerClick(own: ShipView, id: SystemId, delta: 1 | -1): void {
    const s = own.systems[id];
    if (!s) return;
    if (SUBSYSTEMS.includes(id)) return void play(this.db, ["powerUpFail"]);
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
    else if (e.key.toLowerCase() === "z") {
      this.send({ c: "doorsAll", open: true });
      play(this.db, ["doorOpen"]);
    } else if (e.key.toLowerCase() === "x") {
      this.send({ c: "doorsAll", open: false });
      play(this.db, ["doorClose"]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.selected = new Set(own.crew.filter((c) => !c.dead).map((c) => c.id));
    }
  }
}

export const LOGICAL = { W, H };
