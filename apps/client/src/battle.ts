/**
 * The combat screen. Everything the player does becomes a Command sent to the server; everything drawn
 * comes from the latest server snapshot (interpolated between snapshots for smooth motion).
 */
import { Application, Container, FederatedPointerEvent, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import type { GameDB, SystemId } from "@ftl/data";
import { SUBSYSTEMS } from "@ftl/data";
import { RULES, SNAP_HZ, usable, type Command, type MatchView, type ShipView, type WeaponTarget } from "./simlite.ts";
import { animFrame, texNow } from "./assets.ts";
import { play, setSound, soundOn } from "./audio.ts";
import { ShipRenderer, type CrewDraw } from "./render/ship.ts";

const W = 1280;
const H = 720;
const OWN_BOX = { x: 175, y: 95, w: 640, h: 470 };
const ENEMY_BOX = { x: 850, y: 120, w: 415, h: 430 };
const SYS_ORDER: SystemId[] = ["shields", "engines", "oxygen", "weapons", "medbay", "pilot", "sensors", "doors"];

const txt = (s: string, size = 13, fill = 0xe9ecf1, weight: "400" | "700" = "400") =>
  new Text({ text: s, style: new TextStyle({ fontFamily: "system-ui, Segoe UI, sans-serif", fontSize: size, fill, fontWeight: weight }) });

interface Fx {
  node: Container;
  until: number;
  update?: (k: number) => void;
}

export class Battle {
  stage = new Container();
  private world = new Container();
  private hud = new Container();
  private projLayer = new Container();
  private fxLayer = new Container();
  own!: ShipRenderer;
  enemy!: ShipRenderer;
  private ownBox = new Container();
  private enemyBox = new Container();
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
  private bg = new Graphics();
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private sysHit: { id: SystemId; x: number; y: number; w: number; h: number }[] = [];
  private weapHit: { slot: number; x: number; y: number; w: number; h: number; auto: { x: number; y: number; w: number; h: number } }[] = [];
  private crewHit: { id: number; x: number; y: number; w: number; h: number }[] = [];
  private doorBtns: { open: boolean; x: number; y: number; w: number; h: number }[] = [];

  constructor(private app: Application, private db: GameDB, private send: (c: Command) => void, public you: 0 | 1) {
    this.stage.addChild(this.bg, this.world, this.projLayer, this.fxLayer, this.hud);
    this.world.addChild(this.ownBox, this.enemyBox);
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
    this.own = new ShipRenderer(this.db, own.bp, false);
    this.enemy = new ShipRenderer(this.db, en.bp, true);
    this.ownBox.addChild(this.own.root);
    this.enemyBox.addChild(this.enemy.root);
    this.fit();
    const bgT = texNow("stars/bg_darknebula.png");
    if (bgT) {
      const s = new Sprite(bgT);
      s.width = W;
      s.height = H;
      s.alpha = 0.8;
      this.stage.addChildAt(s, 0);
    }
  }

  /** Fit both ships into their boxes; the enemy is mirrored to face us. */
  private fit(): void {
    const place = (r: ShipRenderer, box: typeof OWN_BOX, mirror: boolean) => {
      const b = r.bounds();
      const s = Math.min(1, box.w / b.w, box.h / b.h);
      r.root.scale.set(mirror ? -s : s, s);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      r.root.position.set(mirror ? cx + (b.x + b.w / 2) * s : cx - (b.x + b.w / 2) * s, cy - (b.y + b.h / 2) * s);
    };
    place(this.own, OWN_BOX, false);
    place(this.enemy, ENEMY_BOX, true);
  }

  onSnapshot(v: MatchView): void {
    if (!this.view) this.setupShips(v);
    this.prev = this.view ?? v;
    this.view = v;
    this.snapAt = performance.now();
    for (const e of v.events) this.onEvent(e);
    // Selection only keeps living crew.
    const own = v.ships[v.you];
    for (const id of [...this.selected]) if (!own.crew.find((c) => c.id === id && !c.dead)) this.selected.delete(id);
  }

  private onEvent(e: MatchView["events"][number]): void {
    const v = this.view!;
    const r = e.e === "end" ? null : "ship" in e ? (e.ship === v.you ? this.own : this.enemy) : null;
    const bpOf = (ship: 0 | 1, slot: number) => this.db.weapons[v.ships[ship].weapons[slot]?.bp];
    switch (e.e) {
      case "fire":
        play(this.db, bpOf(e.ship, e.slot)?.sounds?.launch, e.ship === v.you ? 1 : 0.6);
        break;
      case "hit": {
        this.boom(r!, e.px, e.py, e.damage > 0 ? 1.2 : 0.8);
        play(this.db, ["hitHull2", "hitHull3", "smallExplosion"]);
        break;
      }
      case "shield":
        this.ripple(r!, e.px, e.py);
        play(this.db, ["hitShield1", "hitShield2", "hitShield3"]);
        break;
      case "miss":
        this.floatText(r!, e.px, e.py, "MISS", 0xdddddd);
        play(this.db, ["miss"]);
        break;
      case "beam":
        this.beam(r!, e.x1, e.y1, e.x2, e.y2, e.blocked);
        break;
      case "death":
        if (e.ship === v.you) this.toast("Crew member lost");
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- effects

  private addFx(node: Container, secs: number, update?: (k: number) => void): void {
    this.fxLayer.addChild(node);
    this.fx.push({ node, until: this.time + secs, update: update && ((k) => update(k)) });
    (node as Container & { born?: number }).born = this.time;
  }

  private toGlobal(r: ShipRenderer, x: number, y: number) {
    return r.root.toGlobal({ x, y });
  }

  private boom(r: ShipRenderer, x: number, y: number, size: number): void {
    const p = this.stage.toLocal(this.toGlobal(r, x, y));
    const c = new Container();
    c.position.copyFrom(p);
    const sp = new Sprite();
    sp.anchor.set(0.5);
    sp.scale.set(size * 1.6);
    c.addChild(sp);
    const fallback = new Graphics().circle(0, 0, 14 * size).fill({ color: 0xffb040 });
    c.addChild(fallback);
    this.addFx(c, 0.75, (k) => {
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

  private ripple(r: ShipRenderer, x: number, y: number): void {
    const p = this.stage.toLocal(this.toGlobal(r, x, y));
    const g = new Graphics();
    g.position.copyFrom(p);
    this.addFx(g, 0.5, (k) => g.clear().circle(0, 0, 10 + 40 * k).stroke({ color: 0x8fd0ff, width: 3, alpha: 1 - k }));
  }

  private floatText(r: ShipRenderer, x: number, y: number, s: string, color: number): void {
    const p = this.stage.toLocal(this.toGlobal(r, x, y));
    const t = txt(s, 16, color, "700");
    t.anchor.set(0.5);
    t.position.copyFrom(p);
    this.addFx(t, 0.9, (k) => {
      t.y = p.y - 30 * k;
      t.alpha = 1 - k;
    });
  }

  private beam(r: ShipRenderer, x1: number, y1: number, x2: number, y2: number, blocked: boolean): void {
    const a = this.stage.toLocal(this.toGlobal(r, x1, y1));
    const b = this.stage.toLocal(this.toGlobal(r, x2, y2));
    const g = new Graphics();
    this.addFx(g, RULES.beamSweep + 0.3, (k) => {
      const kk = Math.min(1, k * 1.4);
      g.clear()
        .moveTo(a.x, a.y)
        .lineTo(a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk)
        .stroke({ color: blocked ? 0x7fc4ff : 0xff4a3a, width: 5, alpha: 1 - k * 0.6 })
        .moveTo(a.x, a.y)
        .lineTo(a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk)
        .stroke({ color: 0xffffff, width: 1.5, alpha: 1 - k * 0.6 });
    });
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
    clearTimeout((this.toastEl as unknown as { t: number }).t);
    (this.toastEl as unknown as { t: number }).t = window.setTimeout(() => this.toastEl && (this.toastEl.style.display = "none"), 2200);
  }

  // ---------------------------------------------------------------- frame

  frame(dt: number): void {
    this.time += dt;
    const v = this.view;
    if (!v) return;
    const k = Math.min(1, (performance.now() - this.snapAt) / (1000 / SNAP_HZ));
    const ownV = v.ships[v.you];
    const enV = v.ships[1 - v.you];
    this.own.update(ownV, this.crewDraw(ownV, this.prev?.ships[v.you], k, true), this.time, this.hoverOwn);
    this.enemy.update(enV, this.crewDraw(enV, this.prev?.ships[1 - v.you], k, false), this.time, this.armed !== null ? this.hoverEnemy : { room: -1, door: -1 });
    this.drawTargets(ownV);
    this.drawProjectiles(v, k);
    for (const f of [...this.fx]) {
      const born = (f.node as Container & { born: number }).born;
      const kk = Math.min(1, (this.time - born) / (f.until - born));
      f.update?.(kk);
      if (this.time >= f.until) {
        f.node.destroy();
        this.fx.splice(this.fx.indexOf(f), 1);
      }
    }
    this.drawHud(v);
  }

  private crewDraw(s: ShipView, prev: ShipView | undefined, k: number, mine: boolean): CrewDraw[] {
    return s.crew.map((c) => {
      const p = prev?.crew.find((q) => q.id === c.id);
      const x = p ? p.x + (c.x - p.x) * k : c.x;
      const y = p ? p.y + (c.y - p.y) * k : c.y;
      return { c, x, y, selected: mine && this.selected.has(c.id) };
    });
  }

  private drawTargets(own: ShipView): void {
    const g = this.enemy.overlay.clear();
    own.weapons.forEach((w, i) => {
      if (!w.target) return;
      if (w.target.kind === "room") {
        const r = this.enemy.layout.rooms.find((q) => q.id === (w.target as { room: number }).room);
        if (!r) return;
        const cx = (r.x + r.w / 2) * 35;
        const cy = (r.y + r.h / 2) * 35;
        const off = (i - 1.5) * 9;
        g.circle(cx + off, cy + off, 9).stroke({ color: w.autofire ? 0xffd040 : 0xff4040, width: 2 }).moveTo(cx + off - 12, cy + off).lineTo(cx + off + 12, cy + off).moveTo(cx + off, cy + off - 12).lineTo(cx + off, cy + off + 12).stroke({ color: 0xff4040, width: 1.5 });
      } else {
        const t = w.target;
        const bp = this.db.weapons[w.bp];
        const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1) || 1;
        const L = bp?.length || 60;
        g.moveTo(t.x1, t.y1).lineTo(t.x1 + ((t.x2 - t.x1) / len) * L, t.y1 + ((t.y2 - t.y1) / len) * L).stroke({ color: 0xff5050, width: 2, alpha: 0.8 });
      }
    });
    if (this.beamStart && this.armed !== null) g.circle(this.beamStart.x, this.beamStart.y, 5).fill({ color: 0xff5050 });
    // Own-ship overlay: drag box
    const o = this.own.overlay.clear();
    if (this.drag) {
      const a = this.own.root.toLocal({ x: this.drag.x, y: this.drag.y }, this.stage);
      const b = this.own.root.toLocal({ x: this.drag.x2, y: this.drag.y2 }, this.stage);
      o.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)).stroke({ color: 0x7bff7b, width: 1.5 });
    }
  }

  private drawProjectiles(v: MatchView, k: number): void {
    this.projLayer.removeChildren();
    const dtSnap = k / SNAP_HZ;
    for (const p of v.projectiles) {
      if (p.kind === "BEAM" || p.kind === "BOMB") continue;
      if (p.delay - dtSnap > 0) continue;
      const src = p.from === v.you ? this.own : this.enemy;
      const dst = p.from === v.you ? this.enemy : this.own;
      const a = this.stage.toLocal(src.root.toGlobal(src.mountPoint(p.slot)));
      let tx = p.px;
      let ty = p.py;
      if (p.target.kind === "room" && p.kind !== "BURST" && !(tx || ty)) {
        const r = dst.layout.rooms.find((q) => q.id === (p.target as { room: number }).room)!;
        tx = (r.x + r.w / 2) * 35;
        ty = (r.y + r.h / 2) * 35;
      }
      const b = this.stage.toLocal(dst.root.toGlobal({ x: tx, y: ty }));
      const prog = Math.min(1, Math.max(0, (p.t + Math.max(0, dtSnap - Math.max(0, p.delay))) / p.flight));
      const x = a.x + (b.x - a.x) * prog;
      const y = a.y + (b.y - a.y) * prog;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const bp = this.db.weapons[p.weapon];
      const f = bp?.image ? animFrame(this.db, bp.image, Math.floor(this.time * 10)) : null;
      if (f) {
        const s = new Sprite(f);
        s.anchor.set(0.5);
        s.position.set(x, y);
        // Missile art points up, laser art points right.
        s.rotation = p.kind === "MISSILES" ? ang + Math.PI / 2 : ang;
        if (p.kind === "MISSILES") s.scale.set(0.6);
        this.projLayer.addChild(s);
      } else {
        const color = p.kind === "MISSILES" ? 0xffd27a : p.kind === "BURST" ? 0xc0a080 : bp?.ion ? 0x60b0ff : 0xff5040;
        const g = new Graphics();
        g.position.set(x, y);
        g.rotation = ang;
        if (p.kind === "MISSILES") g.rect(-9, -3, 18, 6).fill({ color });
        else if (p.kind === "BURST") g.circle(0, 0, 4).fill({ color });
        else g.roundRect(-10, -2.5, 20, 5, 2).fill({ color });
        this.projLayer.addChild(g);
      }
    }
  }

  // ---------------------------------------------------------------- HUD

  private drawHud(v: MatchView): void {
    this.hud.removeChildren();
    const own = v.ships[v.you];
    const en = v.ships[1 - v.you];
    const g = new Graphics();
    this.hud.addChild(g);
    // Own hull and shields, top left
    this.hull(g, 12, 12, own, "HULL");
    this.shieldPips(g, 12, 40, own);
    const ev = txt(`EVASION ${own.evasion}%   O2 ${Math.round(own.rooms.reduce((a, r) => a + r.o2, 0) / own.rooms.length)}%   MISSILES ${own.missiles}`, 12, 0xcfd6e2);
    ev.position.set(12, 64);
    this.hud.addChild(ev);
    // Enemy panel
    g.rect(ENEMY_BOX.x - 10, 12, ENEMY_BOX.w + 15, 96).fill({ color: 0x1a1d24, alpha: 0.85 }).stroke({ color: 0xc84444, width: 2 });
    const name = txt(`${en.player.toUpperCase()}  —  ${this.db.ships[en.bp]?.title ?? en.bp}`, 13, 0xffb0b0, "700");
    name.position.set(ENEMY_BOX.x, 18);
    this.hud.addChild(name);
    this.hull(g, ENEMY_BOX.x, 40, en, "");
    this.shieldPips(g, ENEMY_BOX.x, 66, en);
    const eev = txt(`EVASION ${en.evasion}%` + (en.interior ? (en.weaponsKnown ? "" : "   · sensors 3 shows weapon charge") : "   · sensors 2 shows interior"), 11, 0xcfd6e2);
    eev.position.set(ENEMY_BOX.x + 110, 66);
    this.hud.addChild(eev);
    // Enemy weapon charge bars (sensor level 3)
    if (en.weaponsKnown) {
      en.weapons.forEach((w, i) => {
        const bp = this.db.weapons[w.bp];
        const x = ENEMY_BOX.x + i * 100;
        const t = txt(bp?.title ?? w.bp, 10, 0xffc0c0);
        t.position.set(x, 86);
        this.hud.addChild(t);
        g.rect(x, 100, 90, 4).fill({ color: 0x333333 }).rect(x, 100, 90 * Math.min(1, w.charge / (bp?.cooldown || 1)), 4).fill({ color: w.powered ? 0xffa040 : 0x666666 });
      });
    }
    this.crewList(g, own);
    this.systems(g, own);
    this.weaponsTray(g, own);
    if (this.armed !== null) {
      const bp = this.db.weapons[own.weapons[this.armed]?.bp];
      const hint = txt(bp?.type === "BEAM" ? (this.beamStart ? "Click to set the beam's direction" : "Click the enemy ship to start the beam") : "Click an enemy room to target — right-click to cancel", 13, 0xffd27a, "700");
      hint.anchor.set(0.5, 0);
      hint.position.set(W / 2, 572);
      this.hud.addChild(hint);
    }
    if (v.config.timeLimit > 0) {
      const left = Math.max(0, v.config.timeLimit - v.tick / 30);
      const t = txt(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`, 16, 0xffffff, "700");
      t.anchor.set(0.5, 0);
      t.position.set(W / 2 + 120, 12);
      this.hud.addChild(t);
    }
    const help = txt(
      "1-4 or click weapon → click enemy room\nright-click weapon: off · A: autofire\ndrag/click crew → right-click a room\nTab: all crew · bars: click +1, right −1\ndoors: click · Z/X all · M: sound",
      10, 0x8f99a8,
    );
    help.position.set(1045, 612);
    this.hud.addChild(help);
    const mode = txt(v.config.winCondition === "crew" ? "WIN: KILL THE ENEMY CREW" : "WIN: DESTROY THE ENEMY SHIP", 12, 0x9fb5d0, "700");
    mode.anchor.set(0.5, 0);
    mode.position.set(W / 2 - 60, 14);
    this.hud.addChild(mode);
  }

  private hull(g: Graphics, x: number, y: number, s: ShipView, label: string): void {
    if (label) {
      const t = txt(label, 11, 0xb8c0cc, "700");
      t.position.set(x, y + 4);
      this.hud.addChild(t);
      x += 38;
    }
    const n = s.maxHull;
    const segW = Math.max(3, Math.min(12, Math.floor((label ? 360 : ENEMY_BOX.w - 10) / n)));
    for (let i = 0; i < n; i++) {
      const on = i < s.hull;
      const col = s.hull / n > 0.66 ? 0x6fdc6f : s.hull / n > 0.33 ? 0xf0c030 : 0xff4a3a;
      g.rect(x + i * segW, y, segW - 2, 18).fill({ color: on ? col : 0x2a2a2a });
    }
    const t = txt(`${s.hull}/${n}`, 11, 0xffffff, "700");
    t.position.set(x + n * segW + 6, y + 2);
    this.hud.addChild(t);
  }

  private shieldPips(g: Graphics, x: number, y: number, s: ShipView): void {
    const sh = s.systems.shields;
    const max = sh ? Math.floor((sh.power >= 0 ? Math.min(sh.power, usable(sh)) : usable(sh)) / 2) : 0;
    const known = Math.max(max, s.shieldLayers);
    for (let i = 0; i < Math.max(known, 1); i++) {
      g.circle(x + 10 + i * 24, y + 10, 9).fill({ color: i < s.shieldLayers ? 0x4aa8ff : 0x1c2a3a }).stroke({ color: 0x6fc0ff, width: 2 });
    }
    if (s.shieldLayers < max && s.shieldCharge > 0) {
      g.rect(x, y + 22, known * 24, 3).fill({ color: 0x1c2a3a }).rect(x, y + 22, known * 24 * s.shieldCharge, 3).fill({ color: 0x4aa8ff });
    }
  }

  private crewList(g: Graphics, s: ShipView): void {
    this.crewHit = [];
    let y = 100;
    for (const c of s.crew) {
      if (c.dead) continue;
      const sel = this.selected.has(c.id);
      g.rect(10, y, 150, 36).fill({ color: sel ? 0x2c4a2c : 0x1a1d24, alpha: 0.9 }).stroke({ color: sel ? 0x7bff7b : 0x5a6272, width: 1.5 });
      const t = txt(c.name, 12, 0xffffff, "700");
      t.position.set(16, y + 3);
      this.hud.addChild(t);
      const task = txt(c.task === "man" ? "manning" : c.task, 10, 0xaab3c0);
      task.position.set(100, y + 5);
      this.hud.addChild(task);
      const hp = c.hp / c.maxHp;
      g.rect(16, y + 22, 136, 7).fill({ color: 0x331111 }).rect(16, y + 22, 136 * hp, 7).fill({ color: hp > 0.5 ? 0x5fdc5f : hp > 0.25 ? 0xf0c030 : 0xff4040 });
      this.crewHit.push({ id: c.id, x: 10, y, w: 150, h: 36 });
      y += 40;
    }
  }

  private systems(g: Graphics, s: ShipView): void {
    this.sysHit = [];
    const baseY = 708;
    // Reactor
    const used = Object.values(s.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
    const free = s.reactor - used;
    for (let i = 0; i < s.reactor; i++) {
      const col = i < free ? 0x6fdc6f : 0x2a3a2a;
      g.rect(12 + Math.floor(i / 10) * 18, baseY - 10 - (i % 10) * 9, 14, 7).fill({ color: col });
    }
    const rt = txt("PWR", 10, 0xb8c0cc, "700");
    rt.position.set(10, baseY);
    this.hud.addChild(rt);
    let x = 12 + Math.ceil(s.reactor / 10) * 18 + 14;
    for (const id of SYS_ORDER) {
      const sys = s.systems[id];
      if (!sys) continue;
      const isSub = SUBSYSTEMS.includes(id);
      const cap = usable(sys);
      for (let i = 0; i < sys.level; i++) {
        const yy = baseY - 46 - i * 9;
        let col = 0x000000;
        let stroke = 0x6fdc6f;
        if (i >= sys.level - sys.damage) {
          col = 0xd03a2a;
          stroke = 0xd03a2a;
        } else if (i >= cap) {
          col = 0x3a7fd0;
          stroke = 0x3a7fd0;
        } else if (i < (isSub ? cap : sys.power)) col = isSub ? 0xd0d0d0 : 0x6fdc6f;
        g.rect(x, yy, 24, 7).fill({ color: col }).stroke({ color: stroke, width: 1 });
      }
      const icon = texNow(`icons/s_${id}_${sys.damage >= sys.level ? "red" : sys.damage > 0 ? "orange" : sys.power === 0 && !isSub ? "grey" : "green"}1.png`);
      if (icon) {
        const sp = new Sprite(icon);
        sp.scale.set(0.5);
        sp.position.set(x - 4, baseY - 36);
        this.hud.addChild(sp);
      } else {
        const t = txt(id.slice(0, 3).toUpperCase(), 10, 0xffffff, "700");
        t.position.set(x, baseY - 30);
        this.hud.addChild(t);
      }
      this.sysHit.push({ id, x: x - 4, y: baseY - 46 - sys.level * 9, w: 32, h: sys.level * 9 + 50 });
      x += 40;
    }
    // Door buttons
    if (s.systems.doors) {
      this.doorBtns = [
        { open: true, x, y: baseY - 60, w: 74, h: 24 },
        { open: false, x, y: baseY - 30, w: 74, h: 24 },
      ];
      for (const b of this.doorBtns) {
        g.rect(b.x, b.y, b.w, b.h).fill({ color: 0x2b3240 }).stroke({ color: 0x6d7686, width: 1 });
        const t = txt(b.open ? "Open doors" : "Close doors", 10, 0xffffff);
        t.position.set(b.x + 6, b.y + 5);
        this.hud.addChild(t);
      }
    } else this.doorBtns = [];
  }

  private weaponsTray(g: Graphics, s: ShipView): void {
    this.weapHit = [];
    const x0 = 470;
    const y0 = 610;
    const ws = s.systems.weapons;
    const label = txt(ws ? `WEAPONS  ${ws.power}/${usable(ws)}` : "NO WEAPONS SYSTEM", 11, 0xb8c0cc, "700");
    label.position.set(x0, y0 - 18);
    this.hud.addChild(label);
    s.weapons.forEach((w, i) => {
      const bp = this.db.weapons[w.bp];
      const x = x0 + i * 140;
      const armed = this.armed === i;
      g.rect(x, y0, 132, 94).fill({ color: armed ? 0x3a2a14 : 0x1a1d24, alpha: 0.95 }).stroke({ color: armed ? 0xffd27a : w.powered ? 0x6fdc6f : 0x5a6272, width: 2 });
      const t = txt(`${i + 1}. ${bp?.title ?? w.bp}`, 11, w.powered ? 0xffffff : 0x9aa3b2, "700");
      t.position.set(x + 6, y0 + 4);
      this.hud.addChild(t);
      for (let p = 0; p < (bp?.power ?? 1); p++) g.rect(x + 6 + p * 12, y0 + 24, 9, 9).fill({ color: w.powered ? 0x6fdc6f : 0x000000 }).stroke({ color: 0x6fdc6f, width: 1 });
      const cd = bp?.cooldown ?? 1;
      const ready = w.volleys > 0;
      g.rect(x + 6, y0 + 40, 120, 8).fill({ color: 0x222222 }).rect(x + 6, y0 + 40, 120 * Math.min(1, ready ? 1 : w.charge / cd), 8).fill({ color: ready ? 0xffd040 : 0x6fdc6f });
      const st = txt(
        bp ? `${bp.type === "BURST" ? "flak" : bp.type.toLowerCase()} · ${bp.damage}dmg x${bp.type === "BEAM" ? 1 : bp.shots}${bp.missiles ? ` · ${bp.missiles} msl` : ""}${bp.chargeLevels > 1 ? ` · ${w.volleys}/${bp.chargeLevels}` : ""}` : "",
        10, 0xaab3c0,
      );
      st.position.set(x + 6, y0 + 52);
      this.hud.addChild(st);
      const auto = { x: x + 6, y: y0 + 68, w: 120, h: 20 };
      g.rect(auto.x, auto.y, auto.w, auto.h).fill({ color: w.autofire ? 0x5a4a14 : 0x2b3240 }).stroke({ color: w.autofire ? 0xffd040 : 0x6d7686, width: 1 });
      const at = txt(w.autofire ? "AUTOFIRE ON" : "autofire off", 10, w.autofire ? 0xffe080 : 0xb8c0cc, "700");
      at.position.set(auto.x + 6, auto.y + 4);
      this.hud.addChild(at);
      this.weapHit.push({ slot: i, x, y: y0, w: 132, h: 66, auto });
    });
  }

  // ---------------------------------------------------------------- input

  private inBox(p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }

  private onDown(e: FederatedPointerEvent): void {
    const v = this.view;
    if (!v || v.winner !== null) return;
    const p = this.stage.toLocal(e.global);
    const right = e.button === 2;
    const own = v.ships[v.you];
    for (const s of this.sysHit) {
      if (this.inBox(p, s)) {
        if (!SUBSYSTEMS.includes(s.id)) this.send({ c: "power", system: s.id, delta: right ? -1 : 1 });
        return;
      }
    }
    for (const b of this.doorBtns) if (this.inBox(p, b)) return this.send({ c: "doorsAll", open: b.open });
    for (const w of this.weapHit) {
      if (this.inBox(p, w.auto)) return this.send({ c: "autofire", slot: w.slot, on: !own.weapons[w.slot].autofire });
      if (this.inBox(p, w)) return this.clickWeapon(w.slot, right);
    }
    for (const c of this.crewHit) {
      if (this.inBox(p, c)) {
        if (!e.shiftKey) this.selected.clear();
        this.selected.add(c.id);
        return;
      }
    }
    // Enemy ship: targeting
    const ep = this.enemy.root.toLocal(e.global);
    const eh = this.enemy.pick(ep.x, ep.y);
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
    // Own ship: crew, doors
    const op = this.own.root.toLocal(e.global);
    const oh = this.own.pick(op.x, op.y);
    if (right) {
      if (oh.room >= 0 && this.selected.size) this.send({ c: "moveCrew", crew: [...this.selected], room: oh.room });
      return;
    }
    if (oh.door >= 0) return this.send({ c: "door", door: oh.door, open: !own.doors[oh.door] });
    const hit = own.crew.find((c) => !c.dead && Math.hypot(c.x + 0.5 - op.x / 35, c.y + 0.5 - op.y / 35) < 0.45);
    if (hit) {
      if (!e.shiftKey) this.selected.clear();
      this.selected.add(hit.id);
      return;
    }
    this.drag = { x: p.x, y: p.y, x2: p.x, y2: p.y };
  }

  private onMove(e: FederatedPointerEvent): void {
    const p = this.stage.toLocal(e.global);
    if (this.drag) {
      this.drag.x2 = p.x;
      this.drag.y2 = p.y;
    }
    const op = this.own.root?.toLocal(e.global);
    const ep = this.enemy?.root.toLocal(e.global);
    if (op) this.hoverOwn = this.selected.size ? this.own.pick(op.x, op.y) : { room: -1, door: this.own.pick(op.x, op.y).door };
    if (ep) this.hoverEnemy = this.enemy.pick(ep.x, ep.y);
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
    if (right) {
      if (w.powered) this.send({ c: "weaponPower", slot, on: false });
      if (this.armed === slot) this.disarm();
      return;
    }
    if (!w.powered) return this.send({ c: "weaponPower", slot, on: true });
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
      const alive = own.crew.filter((c) => !c.dead);
      this.selected = new Set(alive.map((c) => c.id));
    }
  }
}

export const LOGICAL = { W, H };
