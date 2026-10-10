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
import { baseSystemId, SUBSYSTEMS } from "@ftl/data";
import { RULES, SNAP_HZ, usable, type Command, type MatchView, type ShipView, type WeaponTarget } from "./simlite.ts";
import { animFrame, frame, texNow } from "./assets.ts";
import { loop, music, musicEnabled, pickBattleTrack, play, setMusic, setSound, soundOn, stopLoops } from "./audio.ts";
import { fstyle, Imm } from "./imm.ts";
import { ShipRenderer, type CrewDraw } from "./render/ship.ts";

const W = 1280;
const H = 720;
/** Own-ship view: the ship is centred where FTL centres the player's ship. */
const OWN = { cx: 467, cy: 346, w: 700, h: 470, clipX: 868 };
/** FTL's hostiles window (box_hostiles2) and the part of it the enemy ship is fitted into. */
const WIN = { x: 870, y: 45, w: 410, h: 555 };
const WIN_SHIP = { x: WIN.x + 18, y: WIN.y + 104, w: 366, h: 372 };
const MAIN_SYS: SystemId[] = ["shields", "engines", "medbay", "clonebay", "oxygen", "weapons", "drones", "teleporter", "cloaking", "hacking", "mind", "artillery"];
const ACTIVE_DRONES = ["COMBAT", "DEFENSE", "SHIP_REPAIR", "BATTLE", "REPAIR", "BOARDER", "SHIELD"];
const UNIT_DRONES = ["BATTLE", "REPAIR", "BOARDER"];
// The battery leads the subsystems group (its compact panel sits to its left, clear of the target window).
const SUB_SYS: SystemId[] = ["battery", "pilot", "sensors", "doors"];
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
  /** Per-shot firing: projectile ids already launched, and the last shot time per `${ship}:${slot}`. */
  private launched = new Set<number>();
  private shotAt = new Map<string, number>();
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
    stopLoops();
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
    if (!this.view) {
      this.setupShips(v);
      music(pickBattleTrack(this.db, v.config.seed));
    }
    this.prev = this.view ?? v;
    this.view = v;
    this.soundscape(v);
    this.snapAt = performance.now();
    for (const e of v.events) this.onEvent(e);
    const own = v.ships[v.you];
    const mine = this.myCrew(v);
    for (const id of [...this.selected]) if (!mine.find((c) => c.id === id && !c.dead && c.dying === undefined)) this.selected.delete(id);
    for (const c of own.crew) {
      if (c.owner !== v.you) continue;
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
        // Projectile weapons sound per shot as each leaves the barrel (drawProjectiles); bombs and beams here.
        if (bpOf(e.ship, e.slot)?.type === "BOMB") play(this.db, ["bombTeleport"], e.ship === v.you ? 1 : 0.6);
        else if (bpOf(e.ship, e.slot)?.type === "BEAM") play(this.db, bpOf(e.ship, e.slot)?.sounds?.launch, e.ship === v.you ? 1 : 0.6);
        break;
      case "breach":
        play(this.db, ["breach", "airLoss"], e.ship === v.you ? 1 : 0.5);
        if (e.ship === v.you) this.say("Hull breach!", 0xff5a50);
        break;
      case "fireStart":
        if (e.ship === v.you) play(this.db, ["fire"], 0.6);
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
      case "intercept": {
        // A defense drone zaps an incoming shot just outside the defender's hull.
        const from = this.dronePos(e.ship, e.drone);
        if (from) {
          const g = new Graphics();
          const dir = e.ship === v.you ? 1 : -1;
          const to = { x: from.x + dir * 70, y: from.y - 20 };
          this.droneAim.set(`${e.ship}:${e.drone}`, to);
          this.addFx(e.ship === v.you ? this.fxOwn : this.fxWin, g, 0.35, (kk) => g.clear().moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0x9fe8ff, width: 3, alpha: 1 - kk }));
          const c = new Graphics().circle(0, 0, 10).fill({ color: 0xffd060 });
          c.position.set(to.x, to.y);
          this.addFx(e.ship === v.you ? this.fxOwn : this.fxWin, c, 0.4, (kk) => {
            c.scale.set(1 + kk * 1.5);
            c.alpha = 1 - kk;
          });
        }
        play(this.db, ["lightLaser1", "smallExplosion"], 0.6);
        break;
      }
      case "teleport":
        play(this.db, ["teleport"], e.ship === v.you ? 1 : 0.6);
        if (e.ship === v.you) this.say(e.out ? "Crew teleported" : "Crew retrieved", 0x9ff0ff);
        else if (e.out) this.say("Intruders aboard!", 0xff5a50);
        break;
      case "battery":
        if (e.ship === v.you) play(this.db, [e.on ? "batteryStart" : "batteryStop"]);
        break;
      case "mind":
        play(this.db, [e.on ? "mindControl" : "mindControlEnd"], 0.9);
        if (e.on) this.say(e.ship === v.you ? "Mind control!" : "Crew member mind controlled!", 0xd070ff);
        break;
      case "cloak":
        play(this.db, [e.on ? "cloak" : "decloak"], e.ship === v.you ? 1 : 0.7);
        if (e.ship !== v.you && e.on) this.say("Enemy cloaked: weapons can't charge", 0xb8c8ff);
        break;
      case "hackLand":
        play(this.db, ["hackLand"], e.ship === v.you ? 0.8 : 1);
        if (e.ship !== v.you) this.say("Hacking drone attached!", 0xd070ff);
        break;
      case "hackPulse":
        play(this.db, ["hackStart"], 1);
        break;
      case "doorBroken":
        play(this.db, ["doorOpen"], 1);
        break;
      case "droneLost":
        if (e.ship === v.you) this.say("Drone destroyed", 0xff8a70);
        break;
      case "death":
        play(this.db, ["death1", "death2"], e.ship === v.you ? 1 : 0.5);
        break;
      case "end": {
        const loser = e.winner === -1 ? -1 : 1 - e.winner;
        const destroyed = /destroyed/.test(e.reason) ? (loser === -1 ? [0, 1] : [loser]) : [];
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
      exploded: ex(v.you), destinations: true, flashTiles: this.flashTiles, engines: eng(ownV), cloaked: (ownV.cloak?.t ?? 0) > 0,
    });
    this.enemy.update(enV, this.crewDraw(enV, this.prev?.ships[1 - v.you], k, false), this.time, {
      hover: this.armed !== null ? this.hoverEnemy : { room: -1, door: -1 }, weaponFrame: (s) => this.weaponFrameFor(enV, (1 - v.you) as 0 | 1, s),
      shieldFlash: this.time - this.shieldHitAt[1 - v.you], exploded: ex(1 - v.you), engines: enV.weaponsKnown ? eng(enV) : 1, cloaked: (enV.cloak?.t ?? 0) > 0,
    });
    this.drawTargets(ownV);
    this.drawProjectiles(v, k);
    this.drawDrones(v);
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
    const fired = this.shotAt.get(`${ship}:${slot}`) ?? this.firedAt.get(`${ship}:${slot}`);
    // Mid-burst: the gun stays charged between shots (each shot replays the fire frames below).
    const pending = this.view?.projectiles.some((p) => p.from === ship && p.slot === slot && p.delay > 0) ?? false;
    // After firing, play the frames past the charged one (recoil for guns, the teleport for bomb launchers).
    const fireDur = bp.type === "BOMB" ? 0.7 : 0.35;
    const shotDur = bp.type === "BOMB" ? fireDur : Math.min(fireDur, RULES.shotSpacing * 0.9);
    if (fired !== undefined && this.time - fired < shotDur) {
      const first = anim.chargedFrame + 1;
      const n = anim.frames - first;
      return Math.min(anim.frames - 1, first + Math.floor(((this.time - fired) / shotDur) * n));
    }
    if (pending) return anim.chargedFrame;
    if (w.charge < 0) return 0;
    if (w.volleys > 0) return anim.chargedFrame;
    if (!w.powered) return 0;
    return Math.floor(Math.min(0.999, w.charge / (bp.cooldown || 1)) * anim.chargedFrame);
  }

  private crewDraw(s: ShipView, prev: ShipView | undefined, k: number, _own: boolean): CrewDraw[] {
    const you = this.view!.you;
    return s.crew.map((c) => {
      const p = prev?.crew.find((q) => q.id === c.id);
      return {
        c, x: p ? p.x + (c.x - p.x) * k : c.x, y: p ? p.y + (c.y - p.y) * k : c.y,
        selected: c.owner === you && this.selected.has(c.id), hostile: c.owner !== you,
      };
    });
  }

  /** The viewer's own crew wherever they are (boarders included), drone units excluded. */
  private myCrew(v: MatchView): ShipView["crew"] {
    return [...v.ships[v.you].crew, ...v.ships[1 - v.you].crew].filter((c) => (c.mind?.owner ?? c.owner) === v.you && c.drone === undefined);
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
      // FTL: yellow reticle = autofire, red = fire once.
      const yellow = w.autofire;
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
      const mine = p.from === v.you;
      if (p.drone !== undefined) {
        // Drone shots: straight from the drone (already beside the target ship) to a room on it.
        const from = this.dronePos(p.from, p.drone);
        const dst2 = mine ? this.enemy : this.own;
        if (!from) continue;
        const layer = mine ? this.projWin : this.projOwn;
        const kk = Math.min(1, (p.t + dtSnap) / p.flight);
        const key = `${p.from}:${p.drone}`;
        if (!this.launched.has(p.id)) {
          this.launched.add(p.id);
          play(this.db, this.db.weapons[p.weapon]?.sounds?.launch, mine ? 0.7 : 0.45);
        }
        if (p.target.kind === "beam") {
          // Beam drones sweep a short line across a room.
          const tg = p.target;
          const a = this.stage.toLocal(dst2.root.toGlobal({ x: tg.x1 + (tg.x2 - tg.x1) * kk, y: tg.y1 + (tg.y2 - tg.y1) * kk }));
          this.droneAim.set(key, a);
          layer.addChild(new Graphics().moveTo(from.x, from.y).lineTo(a.x, a.y).stroke({ color: 0xff5040, width: 5, alpha: 0.5 }).moveTo(from.x, from.y).lineTo(a.x, a.y).stroke({ color: 0xffe0c0, width: 2 }));
          continue;
        }
        const to = this.stage.toLocal(dst2.root.toGlobal({ x: p.px, y: p.py }));
        this.droneAim.set(key, to);
        this.drawShot(layer, this.db.weapons[p.weapon]?.image, from.x + (to.x - from.x) * kk, from.y + (to.y - from.y) * kk, Math.atan2(to.y - from.y, to.x - from.x), p.kind, 1);
        continue;
      }
      if (p.kind === "BEAM") continue;
      if (p.delay - dtSnap > 0) continue;
      if ((p.kind === "BOARDER" || p.kind === "HACK") && !this.launched.has(p.id)) {
        this.launched.add(p.id);
        play(this.db, ["droneLaunch"], mine ? 0.8 : 0.5);
      }
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
        // The bomb materialises in the room: its spin frames (0-3), then its teleport-out frames.
        if (k2 >= 0) {
          const a = bp?.image ? this.db.anims[bp.image] : undefined;
          const n = a?.frames ?? 9;
          const fr = k2 < 0.7 ? Math.floor(this.time * 10) % Math.min(4, n) : Math.min(n - 1, 4 + Math.floor(((k2 - 0.7) / 0.3) * (n - 4)));
          const f = bp?.image ? animFrame(this.db, bp.image, fr) : null;
          const layer = mine ? this.projWin : this.projOwn;
          if (f) {
            const sp = new Sprite(f);
            sp.anchor.set(0.5);
            sp.position.set(target.x, target.y);
            layer.addChild(sp);
          } else this.drawShot(layer, undefined, target.x, target.y, 0, "BOMB", 1);
        }
        continue;
      }
      // Each shot of a burst triggers its own firing animation as it leaves the barrel.
      const shotKey = `${p.from}:${p.slot}`;
      if (!this.launched.has(p.id) && p.delay - dtSnap <= 0) {
        this.launched.add(p.id);
        this.shotAt.set(shotKey, this.time);
        play(this.db, this.db.weapons[p.weapon]?.sounds?.launch, mine ? 1 : 0.6);
      }
      // Out of the barrel at a steady FTL-like speed, straight along the weapon's facing (right for
      // rotated mounts, up for upright ones), until it leaves this view.
      const speed = p.kind === "MISSILES" ? 520 : p.kind === "BURST" ? 680 : 760;
      if (t * speed < 1100 && k2 < 0) {
        const slotBp = v.ships[p.from].weapons[p.slot]?.bp ?? p.weapon;
        const local = p.slot >= 0 ? src.muzzlePoint(p.slot, slotBp) : src.gridCentre();
        const rotated = p.slot >= 0 ? (src.layout.mounts[p.slot]?.rotate ?? true) : mine;
        const muzzle = this.stage.toLocal(src.root.toGlobal(local));
        const ahead = this.stage.toLocal(src.root.toGlobal({ x: local.x + (rotated ? 10 : 0), y: local.y - (rotated ? 0 : 10) }));
        const d = Math.hypot(ahead.x - muzzle.x, ahead.y - muzzle.y) || 1;
        const dx = (ahead.x - muzzle.x) / d;
        const dy = (ahead.y - muzzle.y) / d;
        const dist = speed * t;
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
    if (kind === "HACK") {
      const t = texNow("ship/drones/drone_hack_base.png");
      if (t) {
        const s = new Sprite(t);
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.rotation = ang + Math.PI / 2;
        s.scale.set(0.8);
        s.alpha = alpha;
        layer.addChild(s);
        return;
      }
    }
    if (kind === "BOARDER") {
      // A boarding drone in flight: its engine flare behind the drone body, nose first.
      const eng = texNow("ship/drones/boarder_engine.png");
      const body = animFrame(this.db, "battle_walk_right", 0);
      for (const t of [eng, body]) {
        if (!t) continue;
        const s = new Sprite(t);
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.rotation = t === eng ? ang + Math.PI / 2 : ang;
        s.alpha = alpha;
        layer.addChild(s);
      }
      if (body) return;
    }
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
    this.computeLayout(own);
    this.crewList(own, this.myCrew(v));
    this.systemsBar(own);
    this.subsystems(own);
    this.weaponsTray(own);
    this.droneTray(own);
    for (const id of [...MAIN_SYS, ...SUB_SYS]) {
      const sys = own.systems[id];
      if (!sys) continue;
      const main = MAIN_SYS.filter((x) => own.systems[x]).indexOf(id);
      const sub = SUB_SYS.filter((x) => own.systems[x]).indexOf(id);
      const at = main >= 0 ? { x: SYS_X0 + 32 + main * SYS_DX, y: SYS_ICON_Y + 32 } : sub >= 0 ? { x: this.subX0(own) + 32 + sub * SYS_DX, y: SUB_ICON_Y + 32 } : null;
      if (!at) continue;
      if (sys.ion > 0) this.ionPie(`ion${id}`, sys, at.x, at.y);
      else this.lockPie(`lock${id}`, this.lockLeft(own, id), at.x, at.y);
    }
    if (this.message && this.time < this.message.until) {
      const t = h.text("msg", this.message.text, 440, 588, fstyle("JustinFont12Bold", this.message.color, { stroke: 0x101010, strokeWidth: 3 }), [0.5, 0]);
      t.alpha = Math.min(1, (this.message.until - this.time) / 0.4);
    }
    this.tooltip(v);
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

  private hoverCrew: { id: number; mine: boolean } | null = null;
  private mouse = { x: 0, y: 0 };

  /** Hovering a crew member (on the ship or in the crew list) shows their name, race and health. */
  private tooltip(v: MatchView): void {
    if (!this.hoverCrew) return;
    const ship = this.hoverCrew.mine ? v.ships[v.you] : v.ships[1 - v.you];
    const c = ship.crew.find((q) => q.id === this.hoverCrew!.id && !q.dead);
    if (!c) return;
    const h = this.hud;
    const race = this.db.crew[c.race]?.title ?? c.race;
    const x = Math.min(W - 150, this.mouse.x + 14);
    const y = this.mouse.y < 60 ? this.mouse.y + 18 : this.mouse.y - 46;
    const g = h.gfx("tip");
    g.rect(x, y, 136, 40).fill({ color: 0x141a1c, alpha: 0.95 }).stroke({ color: 0xdfe8e0, width: 2 });
    h.text("tipN", c.name, x + 7, y + 2, fstyle("JustinFont10", 0xffffff));
    h.text("tipR", race, x + 129, y + 3, fstyle("JustinFont8", 0xa8b4b0), [1, 0]);
    const hp = Math.max(0, c.hp / c.maxHp);
    g.rect(x + 7, y + 25, 88, 8).fill({ color: 0x2a1010 }).rect(x + 7, y + 25, Math.floor(88 * hp), 8).fill({ color: hp > 0.5 ? 0x78ff78 : hp > 0.25 ? 0xffe050 : 0xff5040 });
    h.text("tipH", `${Math.ceil(c.hp)}/${c.maxHp}`, x + 129, y + 21, fstyle("JustinFont8", 0xffffff), [1, 0]);
  }

  /** Ambient loops and event sounds driven by our own ship's state. */
  private lowHpBeep = new Map<number, number>();
  private soundscape(v: MatchView): void {
    const own = v.ships[v.you];
    const g = this.own.geo;
    const alive = own.crew.filter((c) => !c.dead && c.dying === undefined);
    const roomOf = (c: { tile: string }) => g.tiles.get(c.tile)?.room;
    const over = v.winner !== null;
    loop(this.db, "fire", !over && own.rooms.some((r) => Object.keys(r.fires).length > 0), 0.8);
    const venting = g.doors.some((d, i) => own.doors[i] && (d.roomA < 0 || d.roomB < 0));
    loop(this.db, "airLeak", !over && (venting || own.rooms.some((r) => Object.keys(r.breaches).length > 0)), 1);
    loop(this.db, "repair", !over && alive.some((c) => c.task === "repair" || c.task === "breach"), 0.8);
    loop(this.db, "extinguish", !over && alive.some((c) => c.task === "fire"), 0.8);
    const med = own.systems.medbay;
    loop(this.db, "healing", !over && !!med && alive.some((c) => c.hp < c.maxHp && roomOf(c) === med.room && c.path.length === 0), 0.7);
    // Low-health beep: once per crew member per threshold crossed (50 %, 25 %), re-armed when healed past it.
    for (const c of alive) {
      const k = c.hp / c.maxHp;
      const level = k < 0.25 ? 2 : k < 0.5 ? 1 : 0;
      const beeped = this.lowHpBeep.get(c.id) ?? 0;
      if (level > beeped) play(this.db, ["lowCrewHealth"]);
      this.lowHpBeep.set(c.id, level);
    }
    // Doors opening/closing (by us, crew or the AI) make their sound.
    const prev = this.prev?.ships[v.you];
    if (prev && prev.doors.length === own.doors.length) {
      const opened = own.doors.some((o, i) => o && !prev.doors[i]);
      const closed = own.doors.some((o, i) => !o && prev.doors[i]);
      if (opened) play(this.db, ["doorOpen"], 2.5);
      else if (closed) play(this.db, ["doorClose"], 2.5);
      else {
        // Crew walking through: the door opens and shuts behind them, a little quieter.
        const held = (s: ShipView, i: number) => (s.doorPass?.[i] ?? 0) > 0 && !s.doors[i];
        if (own.doors.some((_, i) => held(own, i) && !held(prev, i))) play(this.db, ["doorOpen"], 1.2);
        else if (own.doors.some((_, i) => !held(own, i) && held(prev, i))) play(this.db, ["doorClose"], 1.2);
      }
      // An airlock opening to space: the oxygen whoosh.
      if (g.doors.some((d, i) => (d.roomA < 0 || d.roomB < 0) && own.doors[i] && !prev.doors[i])) play(this.db, ["airLoss", "breach"], 1.6);
    }
    for (const c of own.crew) if (c.dead && c.clone !== undefined && prev?.crew.find((q) => q.id === c.id)?.dead === false) this.say(`${c.name} is being cloned`, 0x9ff0ff);
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
    // Zoltan Shield (augment): green-yellow pips above the normal layers.
    for (let i = 0; i < (s.superShield ?? 0); i++) g.rect(34 + i * 18, 45, 14, 4).fill({ color: 0xc8ff40 });
    // The blue bar only shows while a layer is recharging.
    if (s.shieldLayers < max && s.shieldCharge > 0) g.rect(32, 78, Math.floor((90 * s.shieldCharge) / 3) * 3, 6).fill({ color: 0x2a7bff });
    // Missiles (FTL's fuel slot is unused in the arena, so missiles take its place).
    const mt = texNow(s.missiles > 0 ? "statusUI/top_missiles_on.png" : "statusUI/top_missiles_on_red.png");
    if (mt) h.sprite("msl", mt, 122, 43);
    h.text("mslT", String(s.missiles), 174, 45, fstyle("num_font", s.missiles > 0 ? 0xffffff : 0xff6050), [0.5, 0]);
    // Drone parts (FTL's drones box, measured at 258,43), when the ship can use drones.
    if (s.systems.drones || (s.drones ?? []).length) {
      const dt = texNow("statusUI/top_drones_on.png");
      if (dt) h.sprite("drn", dt, 258, 43);
      h.text("drnT", String(s.droneParts ?? 0), 310, 45, fstyle("num_font", (s.droneParts ?? 0) > 0 ? 0xffffff : 0xff6050), [0.5, 0]);
    }
    // Evasion and oxygen
    const o2 = Math.round(s.rooms.reduce((a, r) => a + r.o2, 0) / s.rooms.length);
    const evRed = s.evasion === 0;
    const o2Red = o2 < 25;
    const eo = texNow(evRed && o2Red ? "statusUI/top_evade_oxygen_both_red.png" : evRed ? "statusUI/top_evade_oxygen_up_red.png" : o2Red ? "statusUI/top_evade_oxygen_down_red.png" : "statusUI/top_evade_oxygen.png");
    if (eo) h.sprite("eo", eo, 1, 89);
    h.text("evT", `${s.evasion}%`, 94, 95, fstyle("JustinFont10", 0xffffff), [1, 0]);
    h.text("o2T", `${o2}%`, 94, 116, fstyle("JustinFont10", o2Red ? 0xff8070 : 0xffffff), [1, 0]);
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
    // The enemy's hull is only known with level-3 sensors.
    const segs = en.maxHull;
    const segW = Math.max(3, Math.min(10, Math.floor(160 / segs)));
    // The enemy's hull is always shown, always green (whatever your sensors), as in FTL's target window.
    for (let i = 0; i < segs; i++) g.rect(x + 18 + i * segW, y + 51, segW - 1, 8).fill({ color: i < en.hull ? 0x78ff78 : 0x3a1a1c });
    g.poly([x + 14, y + 62, x + 62, y + 62, x + 70, y + 70, x + 62, y + 76, x + 14, y + 76]).fill({ color: pink });
    h.text("tgtShL", "SHIELDS", x + 18, y + 62, fstyle("HL1", 0x5a2a2e, { stroke: 0xf6d4d4, strokeWidth: 2 }));
    const s1 = texNow("combatUI/box_hostiles_shield1.png");
    const s2 = texNow("combatUI/box_hostiles_shield2.png");
    const sh = en.systems.shields;
    const max = sh ? Math.floor(usable(sh) / 2) : 0;
    for (let i = 0; i < Math.max(max, en.shieldLayers); i++) {
      if (s1 && s2) h.sprite(`enS${i}`, i < en.shieldLayers ? s1 : s2, x + 22 + i * 24, y + 75);
      else g.roundRect(x + 22 + i * 24, y + 78, 18, 18, 4).fill({ color: i < en.shieldLayers ? 0x2a7bff : 0x101820 }).stroke({ color: 0xffffff, width: 2 });
    }
    for (let i = 0; i < (en.superShield ?? 0); i++) g.rect(x + 22 + i * 14, y + 98, 11, 4).fill({ color: 0xc8ff40 });
    const bp = this.db.ships[en.bp];
    h.text("tgtClass", `Class: ${bp?.className?.split(" · ")[0] || bp?.title || en.bp}`, x + 382, y + 37, fstyle("JustinFont10", 0xffffff), [1, 0]);
    h.text("tgtRel", `Captain: ${en.player}`, x + 382, y + 53, fstyle("JustinFont10", 0xff5a50), [1, 0]);

    // (Enemy weapon charge is drawn beside each gun on the enemy ship; see ShipRenderer.)
    // Enemy systems along the bottom of the window.
    const order: SystemId[] = ["pilot", "oxygen", "shields", "engines", "weapons", "drones", "teleporter", "cloaking", "hacking", "mind", "artillery", "artillery2", "artillery3", "artillery4", "medbay", "clonebay", "sensors", "doors", "battery"];
    const present = order.filter((id) => en.systems[id]);
    // Up to 11 icons at FTL's 30 px spacing; the flagship's longer row squeezes to fit the window.
    const step = Math.min(30, 330 / Math.max(1, present.length));
    present.forEach((id, i) => {
      const s = en.systems[id]!;
      const state = s.damage >= s.level ? "red" : s.damage > 0 ? "orange" : s.ion > 0 ? "blue" : en.weaponsKnown && s.power === 0 && !SUBSYSTEMS.includes(id) ? "grey" : "green";
      const t = texNow(`icons/s_${baseSystemId(id)}_${state}1.png`);
      if (t) h.sprite(`eic${id}`, t, x + 74 + i * step, y + 502, { anchor: 0.5, scale: 0.85 * Math.min(1, step / 30 + 0.15), tint: s.hacked ? 0xd070ff : 0xffffff });
      if (s.locked) h.sprite(`eick${id}`, texNow("icons/s_hacked.png"), x + 82 + i * step, y + 494, { anchor: 0.5, scale: 0.6 });
    });

  }

  /** Crew boxes as in FTL: portrait, name, health bar; green when selected. */
  private crewList(s: ShipView, crew: ShipView["crew"]): void {
    const h = this.hud;
    this.crewHit = [];
    const g = h.gfx("crewBoxes");
    let y = 155;
    const away = new Set(crew.filter((c) => !s.crew.includes(c)).map((c) => c.id));
    for (const c of crew) {
      if (c.dead && c.clone !== undefined) {
        // Being cloned: a greyed box with the clone bar (FTL's clonebar).
        g.rect(10, y, 86, 26).fill({ color: 0x14202a, alpha: 0.95 }).stroke({ color: 0x6ab4d0, width: 2 });
        h.text(`cn${c.id}`, c.name, 14, y - 1, fstyle("JustinFont8", 0x9fd8f0));
        g.rect(14, y + 18, Math.floor((78 * c.clone) / 3) * 3, 4).fill({ color: 0x6ad8ff });
        y += 30;
        continue;
      }
      if (c.dead) continue;
      const sel = this.selected.has(c.id);
      g.rect(10, y, 86, 26).fill({ color: sel ? 0x24502c : 0x1a1f22, alpha: 0.95 }).stroke({ color: sel ? 0x78ff78 : 0x7c8686, width: 2 });
      const race = this.db.animSheets[c.race] ? c.race : "human";
      // Portrait with FTL's yellow outline (the race's silhouette sheet, tinted, slightly larger).
      const por = animFrame(this.db, `${race}_portrait`, 0) ?? animFrame(this.db, `${race}_walk_down`, 0);
      const sil = animFrame(this.db, `${race}_portrait`, 0, `people/${race}_color.png`);
      if (sil) h.sprite(`cps${c.id}`, sil, 27, y + 13, { anchor: 0.5, scale: 1.16, tint: 0xffe040 });
      if (por) h.sprite(`cp${c.id}`, por, 27, y + 13, { anchor: 0.5 });
      // One size for every name: JustinFont8, measured against real FTL screenshots (~8 px capitals).
      // Long names are cut off at the box edge rather than shrunk.
      const t = h.text(`cn${c.id}`, c.name, 44, y - 1, fstyle("JustinFont8", sel ? 0xffffff : 0xe8ece8));
      let nm = c.name;
      while (t.width > 50 && nm.length > 1) {
        nm = nm.slice(0, -1);
        t.text = nm;
      }
      const hp = Math.max(0, c.hp / c.maxHp);
      g.rect(44, y + 18, 46 * hp, 4).fill({ color: hp > 0.5 ? 0x78ff78 : hp > 0.25 ? 0xffe050 : 0xff5040 });
      // Boarders: a small teleport mark on the box.
      if (away.has(c.id)) g.poly([84, y + 3, 92, y + 3, 92, y + 11]).fill({ color: 0xffd040 });
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
  /** AUTOFIRE mode: new targets autofire unless Shift is held (and vice versa). */
  private autoMode = false;
  /** Saved stations: crew id -> room. */
  private savedStations = new Map<number, number>();

  /** One system's power bars above its icon. Damaged bars are red, filling yellow while repaired. */
  /** Bar pitch: FTL's 9 px, squeezed for unrestricted builds with many bars. */
  private pitch(level: number): number {
    return level <= 8 ? BAR_PITCH : Math.max(3, Math.floor(72 / level));
  }

  /**
   * Ion lock, as FTL draws it: the system icon becomes a blue badge numbered with the stacks left
   * (icons/locking/s_ring_N_base), ringed by one segmented timer that empties over the current stack.
   * When it runs out the number drops by one and the ring starts again.
   */
  private ionPie(key: string, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, cy: number): void {
    if (sys.ion > 0) this.countdown(key, Math.min(9, sys.ion), Math.max(0, Math.min(1, sys.ionTimer / RULES.ionDuration)), cx, cy, "ring");
  }

  /**
   * After use, cloaking, hacking, mind control and the battery lock like an ion hit, shown the same
   * way in FTL's octagon art: the number is full 5 s rounds left, the ring empties over the current one.
   */
  private lockLeft(s: ShipView, id: SystemId): number {
    if (id === "cloaking") return (s.cloak?.t ?? 0) > 0 ? 0 : s.cloak?.cd ?? 0;
    if (id === "hacking") return s.hack?.attached && (s.hack.pulse ?? 0) <= 0 ? s.hack.cd ?? 0 : 0;
    if (id === "mind") return s.mindCd ?? 0;
    if (id === "battery") return (s.battery?.t ?? 0) > 0 ? 0 : s.battery?.cd ?? 0;
    return 0;
  }

  private lockPie(key: string, left: number, cx: number, cy: number): void {
    if (left <= 0) return;
    const round = 5;
    const n = Math.min(9, Math.ceil(left / round));
    const k = (left - (n - 1) * round) / round;
    this.countdown(key, n, Math.max(0, Math.min(1, k)), cx, cy, "octa");
  }

  private countdown(key: string, n: number, k: number, cx: number, cy: number, art: "ring" | "octa"): void {
    const h = this.hud;
    const badge = texNow(`icons/locking/s_${art}_${n}_base.png`);
    const ring = texNow(`icons/locking/s_${art}_timer.png`);
    if (badge) h.sprite(`${key}b`, badge, cx, cy, { anchor: 0.5 });
    else h.gfx(`${key}bg`).circle(cx, cy, 13).fill({ color: 0x0c2a2c }).stroke({ color: 0x6ad8ff, width: 2 });
    if (!badge) h.text(`${key}n`, String(n), cx, cy, fstyle("JustinFont10", 0x9ff0ff), [0.5, 0.5]);
    // FTL's timer ring has 12 dashes, one per 30° clockwise from 12 o'clock. Whole dashes still to go
    // show through one mask; the dash being used up fades out smoothly through a second.
    const m = k * 12;
    const whole = Math.floor(m);
    const frac = m - whole;
    const deg = (d: number) => (d * Math.PI) / 180;
    const wedge = (g: Graphics, a0: number, a1: number) => (a1 > a0 ? g.moveTo(cx, cy).arc(cx, cy, 40, deg(a0), deg(a1)).closePath().fill({ color: 0xffffff }) : g);
    const maskA = wedge(h.gfx(`${key}m`), -90 + 30 * (12 - whole), 270);
    const maskB = wedge(h.gfx(`${key}m2`), -90 + 30 * (11 - whole), -90 + 30 * (12 - whole));
    if (ring) {
      const a = h.sprite(`${key}r`, ring, cx, cy, { anchor: 0.5 });
      if (a) a.mask = maskA;
      if (whole < 12 && frac > 0) {
        const p = h.sprite(`${key}r2`, ring, cx, cy, { anchor: 0.5, alpha: frac });
        if (p) p.mask = maskB;
      }
    } else {
      maskA.clear();
      maskB.clear();
      h.gfx(`${key}rg`).arc(cx, cy, 18, -Math.PI / 2 + (1 - k) * Math.PI * 2, Math.PI * 1.5).stroke({ color: 0x6ad8ff, width: 3 });
    }
  }

  private bars(key: string, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, bottom: number): void {
    const g = this.hud.gfx(key);
    const BAR_PITCH = this.pitch(sys.level);
    const BAR_H = Math.min(7, BAR_PITCH - 2);
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
        if (b === sys.level - sys.damage && sys.repair > 0) g.rect(x, yy, Math.floor((BAR_W * sys.repair) / 3) * 3, BAR_H).fill({ color: 0xffe050 });
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
    // Panels re-register their buttons as they're drawn; nothing stale stays clickable.
    this.teleBtns = [];
    this.telePanelBox = null;
    this.teleWhy = "";
    this.cloakBtn = null;
    this.hackBtns = [];
    this.mindBtn = null;
    this.artilleryBtn = null;
    this.batteryBtn = null;
    const used = Object.values(s.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
    const bonus = Math.max(0, s.reactorBonus ?? 0);
    const free = s.reactor + (s.reactorBonus ?? 0) - used;
    const g = h.gfx("reactor");
    // Reactor: free power green from the bottom, used power as outlines; hatch and wire to the systems.
    const shown = Math.min(s.reactor + bonus, 10);
    for (let i = 0; i < shown; i++) {
      const yy = 686 - i * BAR_PITCH;
      // Battery bars sit on top of the reactor's, in FTL's battery orange.
      if (i < free) g.rect(13, yy, 27, 6).fill({ color: i >= s.reactor ? 0xffa030 : 0x78ff78 });
      else g.rect(13.5, yy + 0.5, 26, 5).stroke({ color: 0xe8ece8, width: 1 });
    }
    const systems = MAIN_SYS.map((id) => s.systems[id]).filter(Boolean) as NonNullable<ShipView["systems"][SystemId]>[];
    const right = SYS_X0 + 32 + (systems.length - 1) * SYS_DX + 20;
    for (let yy = 627; yy < 690; yy += 6) g.moveTo(44, yy + 6).lineTo(50, yy).stroke({ color: 0x8a948c, width: 2 });
    g.moveTo(46, 690).lineTo(58, 704).lineTo(right, 704).stroke({ color: 0xe8ece8, width: 2.5 });
    systems.forEach((sys, i) => {
      const cx = SYS_X0 + 32 + i * SYS_DX;
      g.moveTo(cx - 10, 704).lineTo(cx - 2, 696).stroke({ color: 0xe8ece8, width: 2 });
      this.bars(`b${sys.id}`, sys, cx, 657);
      if (this.manned(s, sys.id)) h.sprite(`mn${sys.id}`, texNow("systemUI/manning_white.png"), cx, 657 - sys.level * this.pitch(sys.level) - 2, { anchor: [0.5, 1], scale: 0.7 });
      const icon = texNow(`icons/s_${sys.id}_${this.iconState(sys)}1.png`) ?? texNow(`icons/s_${sys.id}_green1.png`);
      if (icon) {
        if (sys.ion <= 0 && this.lockLeft(s, sys.id) <= 0) h.sprite(`si${sys.id}`, icon, SYS_X0 + i * SYS_DX, SYS_ICON_Y, { tint: sys.hacked ? 0xd070ff : 0xffffff });
      } else if (sys.ion <= 0) h.text(`si${sys.id}`, sys.id.slice(0, 3).toUpperCase(), cx, SYS_ICON_Y + 32, fstyle("JustinFont10", 0xffffff), [0.5, 0.5]);
      this.sysHit.push({ id: sys.id, box: { x: cx - 16, y: 657 - sys.level * this.pitch(sys.level) - 4, w: 32, h: sys.level * this.pitch(sys.level) + 60 } });
      const top = 657 - sys.level * this.pitch(sys.level) - 8;
      if (sys.id === "teleporter") this.telePanel(s, sys, cx, top);
      if (sys.id === "cloaking") this.cloakPanel(s, sys, cx, top);
      if (sys.id === "hacking") this.hackPanel(s, sys, cx, top);
      if (sys.id === "mind") this.mindPanel(s, sys, cx, top);
      if (sys.id === "artillery") this.artilleryPanel(s, sys, cx, top);
      // A hacking drone on this system: FTL's purple hacked mark (the icon goes purple while it pulses).
      if (sys.locked) h.sprite(`hk${sys.id}`, texNow("icons/s_hacked.png"), cx + 10, SYS_ICON_Y + 12, { anchor: 0.5 });
    });
  }

  private trayDx = 0;
  private telePanelBox: Box | null = null;
  private teleWhy = "";
  private teleBtns: { out: boolean; box: Box }[] = [];
  private teleMode: "send" | "return" | "hack" | "mind" | "artillery" | null = null;

  /** FTL's teleporter panel above its bars: the charge gauge, then send (top) and return (bottom) buttons. */
  private telePanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, bottom: number): void {
    const h = this.hud;
    this.teleBtns = [];
    const x = cx - 20;
    const y = bottom - 79;
    const lv = Math.min(3, usable(sys));
    const cd = RULES.teleCooldown[lv] || 1;
    const k = lv > 0 ? Math.min(1, (s.tele ?? 0) / cd) : 0;
    const ready = k >= 1;
    const base = texNow("systemUI/button_teleport_base.png");
    if (!base) return;
    h.sprite("tpB", base, x, y);
    // Clicking a teleporter that isn't ready says why (FTL just greys it out, which reads as "broken").
    this.telePanelBox = { x, y, w: 40, h: 79 };
    this.teleWhy = lv <= 0 ? "The teleporter needs power" : !ready ? "The teleporter is charging" : "";
    if (!ready) {
      // Charging: the striped gauge fills from the bottom.
      h.sprite("tpC0", texNow("systemUI/button_teleport_charging_off.png"), x, y);
      const on = texNow("systemUI/button_teleport_charging_on.png");
      if (on) {
        const top = 10 + Math.round(43 * (1 - k));
        h.sprite("tpC1", frame(on, 0, top, 40, 53 - top), x, y + top);
      }
      return;
    }
    const anyAway = this.myCrew(this.view!).some((c) => !c.dead && !s.crew.includes(c));
    const sel = (m: "send" | "return") => (this.teleMode === m ? "select2" : "on");
    h.sprite("tpT", texNow(`systemUI/button_teleport_top_${sel("send")}.png`), x, y);
    h.sprite("tpBt", texNow(`systemUI/button_teleport_bottom_${anyAway ? sel("return") : "off"}.png`), x, y);
    this.teleBtns.push({ out: true, box: { x: x + 4, y: y + 4, w: 32, h: 32 } }, { out: false, box: { x: x + 4, y: y + 27, w: 32, h: 32 } });
    if (this.teleMode === "send" || this.teleMode === "return") h.text("tpHint", this.teleMode === "send" ? "Click an enemy room to board" : "Click the enemy room to retrieve from", OWN.cx, 588, fstyle("JustinFont10", 0x9ff0ff, { stroke: 0x101010 }), [0.5, 0]);
  }

  private cloakBtn: Box | null = null;
  private hackBtns: { kind: "launch" | "pulse"; box: Box }[] = [];

  /** A charge gauge (FTL's striped bar) filled k of the way up, cropped from the "on" art over the "off" art. */
  private gauge(key: string, off: string, on: string, x: number, y: number, top: number, height: number, k: number): void {
    const h = this.hud;
    h.sprite(`${key}0`, texNow(off), x, y);
    const t = texNow(on);
    if (!t) return;
    const from = top + Math.round(height * (1 - Math.max(0, Math.min(1, k))));
    if (from < top + height) h.sprite(`${key}1`, frame(t, 0, from, t.width, top + height - from), x, y + from);
  }

  /** FTL's cloak button above its bars: lit when ready, glowing while cloaked, a filling gauge while it recharges. */
  private cloakPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, bottom: number): void {
    const h = this.hud;
    this.cloakBtn = null;
    const n = Math.max(1, Math.min(3, sys.level));
    const x = cx - 20;
    const y = bottom - 92;
    const base = texNow(`systemUI/button_cloaking${n}_base.png`);
    if (!base) return;
    h.sprite("ckB", base, x, y);
    const c = s.cloak;
    const lv = Math.min(3, Math.min(sys.power + (sys.bonus ?? 0), usable(sys)));
    if ((c?.t ?? 0) > 0) {
      this.gauge("ckG", `systemUI/button_cloaking${n}_charging_off.png`, `systemUI/button_cloaking${n}_charging_on.png`, x, y, 35, 31, (c!.t) / (RULES.cloakDuration[lv] || 1));
      return;
    }
    const ready = lv > 0 && !sys.hacked && (c?.cd ?? 0) <= 0;
    h.sprite("ckOn", texNow(`systemUI/button_cloaking${n}_${ready ? "on" : "off"}.png`), x, y);
    if (ready) this.cloakBtn = { x: x + 4, y: y + 29, w: 32, h: 43 };
  }

  /** FTL's hacking panel: the top button launches the drone (one drone part), the bottom one pulses it. */
  private hackPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, bottom: number): void {
    const h = this.hud;
    this.hackBtns = [];
    const x = cx - 20;
    const y = bottom - 81;
    const top = texNow("systemUI/button_hack2_top_base.png");
    if (!top) return;
    h.sprite("hkT", top, x, y);
    h.sprite("hkBm", texNow("systemUI/button_hack2_bottom_base.png"), x, y);
    const hk = s.hack;
    const powered = usable(sys) > 0 && (sys.power + (sys.bonus ?? 0)) > 0;
    const canLaunch = powered && !hk && (s.droneParts ?? 0) > 0;
    const sel = this.teleMode === "hack" ? "select2" : canLaunch ? "on" : "off";
    h.sprite("hkD", texNow(`systemUI/button_hack_drone_${sel}.png`), x, y);
    if (canLaunch) this.hackBtns.push({ kind: "launch", box: { x: x + 10, y: y + 10, w: 20, h: 20 } });
    const pulsing = (hk?.pulse ?? 0) > 0;
    const ready = powered && !!hk?.attached && !pulsing && (hk?.cd ?? 0) <= 0;
    h.sprite("hkG", texNow(pulsing ? "systemUI/button_hack_grid_purple_on.png" : ready ? "systemUI/button_hack_grid_on.png" : "systemUI/button_hack_grid_off.png"), x, y);
    if (ready) this.hackBtns.push({ kind: "pulse", box: { x: x + 10, y: y + 36, w: 20, h: 20 } });
    if (this.teleMode === "hack") h.text("hkHint", "Click an enemy room to attach the hacking drone", OWN.cx, 588, fstyle("JustinFont10", 0xd8a0ff, { stroke: 0x101010 }), [0.5, 0]);
  }

  /**
   * Bottom HUD layout for this frame: the weapons tray slides right for each system past five (FTL's
   * tray fits five), the drone tray sits flush to its right, and the subsystems move right if they must.
   */
  private lay = { trayDx: 0, droneX0: 660, subX0: SUB_X0 };
  private computeLayout(s: ShipView): void {
    const main = MAIN_SYS.filter((id) => s.systems[id]).length;
    const trayDx = Math.max(0, main - 5) * SYS_DX;
    const boxW = (n: number) => 31 + 97 * n;
    const wslots = Math.max(2, Math.min(4, this.db.ships[s.bp]?.weaponSlots ?? 4));
    const weaponsRight = TRAY.x + trayDx + boxW(wslots);
    const dslots = this.db.ships[s.bp]?.droneSlots ?? 0;
    const hasDrones = !!s.systems.drones && dslots > 0;
    const droneX0 = weaponsRight - 3;
    const droneRight = hasDrones ? droneX0 + boxW(Math.max(2, Math.min(4, dslots))) : 0;
    const base = s.systems.battery ? SUB_X0 - SYS_DX : SUB_X0;
    // The battery's side panel needs its own 44 px left of the group.
    this.lay = { trayDx, droneX0, subX0: Math.max(base, droneRight + 6 + (s.systems.battery ? 44 : 0)) };
    this.trayDx = trayDx;
  }

  /** Left edge of the subsystems group. */
  private subX0(_s: ShipView): number {
    return this.lay.subX0;
  }

  private batteryBtn: Box | null = null;
  private mindBtn: Box | null = null;
  private artilleryBtn: Box | null = null;

  /** Battery panel: the icon lights when it can be switched on; the gauge shows bonus time, then the lock. */
  private batteryPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, bottom: number): void {
    const h = this.hud;
    this.batteryBtn = null;
    // FTL's battery frame without its pointer, standing beside the battery rather than above it.
    const x = cx - 20;
    const y = bottom - 92;
    const base = texNow("systemUI/button_battery3_base.png");
    if (!base) return;
    h.sprite("btB", frame(base, 0, 13, 40, 79), x, y + 13);
    const b = s.battery;
    const g = h.gfx("btG");
    if ((b?.t ?? 0) > 0) {
      // Bonus power left: the warm-up bar drains.
      const k = b!.t / RULES.batteryDuration;
      g.rect(x + 12, y + 30 + Math.round(48 * (1 - k)), 16, Math.round(48 * k)).fill({ color: 0xffd040 });
      return;
    }
    const ready = usable(sys) > 0 && !sys.hacked && (b?.cd ?? 0) <= 0;
    h.sprite("btI", texNow(`icons/s_battery_${ready ? "green" : "grey"}1.png`), cx, y + 52, { anchor: 0.5, scale: 0.7 });
    if (ready) this.batteryBtn = { x: x + 4, y: y + 28, w: 32, h: 50 };
  }

  /**
   * Mind control panel, cloak-style: FTL's button (not the system icon) when it can be used; while someone
   * is controlled the warm-up bar shows the control time left. The recharge after shows on the icon.
   */
  private mindPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, bottom: number): void {
    const h = this.hud;
    this.mindBtn = null;
    const x = cx - 20;
    const y = bottom - 92;
    const base = texNow("systemUI/button_cloaking2_base.png");
    if (!base) return;
    h.sprite("mdB", base, x, y);
    const v = this.view!;
    const held = [...v.ships[0].crew, ...v.ships[1].crew].find((c) => c.mind?.by === s.idx);
    if (held?.mind) {
      const lv = Math.max(1, Math.min(3, sys.level));
      this.gauge("mdG", "systemUI/button_cloaking2_charging_off.png", "systemUI/button_cloaking2_charging_on.png", x, y, 35, 31, held.mind.t / RULES.mindDuration[lv]);
      return;
    }
    const powered = Math.min(sys.power + (sys.bonus ?? 0), usable(sys)) > 0 && !sys.hacked;
    const ready = powered && (s.mindCd ?? 0) <= 0;
    h.sprite("mdOn", texNow(`systemUI/button_cloaking2_${this.teleMode === "mind" ? "select2" : ready ? "on" : "off"}.png`), x, y);
    if (ready) this.mindBtn = { x: x + 4, y: y + 29, w: 32, h: 43 };
    if (this.teleMode === "mind") h.text("mdHint", "Click a room with enemy crew (theirs, or intruders here)", OWN.cx, 588, fstyle("JustinFont10", 0xd8a0ff, { stroke: 0x101010 }), [0.5, 0]);
  }

  /** Artillery: FTL's tall charge frame filling up; click it, then an enemy room to aim (right-click: random). */
  private artilleryPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, cx: number, bottom: number): void {
    const h = this.hud;
    const lv = Math.max(1, Math.min(4, sys.level));
    const frameT = texNow(`systemUI/button_artillery_${lv}.png`);
    const x = cx - 11;
    const y = bottom - 75;
    this.artilleryBtn = { x, y, w: 23, h: 75 };
    if (frameT) h.sprite("arB", frameT, x, y);
    const bp = sys.weapon ? this.db.weapons[sys.weapon] : undefined;
    if (!bp) return;
    const fast = bp.id.startsWith("ARTILLERY_FED") ? RULES.artilleryCharge[Math.min(4, usable(sys))] : 1;
    const k = Math.min(1, (sys.charge ?? 0) / (bp.cooldown * fast || 1));
    const top = y + 4 + (4 - lv) * 10;
    const hgt = y + 62 - top;
    h.gfx("arG").rect(x + 6, top + Math.round(hgt * (1 - k)), 11, Math.round(hgt * k)).fill({ color: k >= 1 ? 0x78ff78 : 0xffd040 });
    if (this.teleMode === "artillery") h.text("arHint", "Click an enemy room to aim the artillery (right-click: random rooms)", OWN.cx, 588, fstyle("JustinFont10", 0xffd27a, { stroke: 0x101010 }), [0.5, 0]);
  }

  private teleClick(own: ShipView, out: boolean): void {
    const ts = own.systems.teleporter;
    if (!ts) return;
    const g = this.own.geo;
    const onPad = own.crew.filter((c) => c.owner === own.idx && !c.dead && c.drone === undefined && !c.mind && g.tiles.get(c.tile)?.room === ts.room);
    if (out && !onPad.length) return this.fail("Move crew onto the teleporter pad first");
    if (out && !onPad.some((c) => c.path.length === 0)) return this.fail("Wait for your crew to reach the pad");
    play(this.db, ["powerUpSystem"]);
    this.teleMode = out ? "send" : "return";
  }

  /** Bottom right: piloting, sensors and doors with the SUBSYSTEMS tab and FTL's door button. */
  private subsystems(s: ShipView): void {
    const h = this.hud;
    const subs = SUB_SYS.map((id) => s.systems[id]).filter(Boolean) as NonNullable<ShipView["systems"][SystemId]>[];
    const tab = texNow("box_subsystems4.png");
    // The tab sits under piloting, sensors and doors (the battery, when fitted, stands to its left).
    const tabX = this.subX0(s) + (s.systems.battery ? SYS_DX : 0) + 7;
    if (tab) h.sprite("subTab", tab, tabX, 664);
    else h.gfx("subTabG").roundRect(1024, 666, 165, 34, 4).fill({ color: 0xd8e4dc });
    this.label("subT", "SUBSYSTEMS", tabX + 12, 669);
    subs.forEach((sys, i) => {
      const cx = this.subX0(s) + 32 + i * SYS_DX;
      this.bars(`sb${sys.id}`, sys, cx, 639);
      if (this.manned(s, sys.id)) h.sprite(`smn${sys.id}`, texNow("systemUI/manning_white.png"), cx, 639 - sys.level * this.pitch(sys.level) - 2, { anchor: [0.5, 1], scale: 0.7 });
      const icon = texNow(`icons/s_${sys.id}_${this.iconState(sys)}1.png`);
      if (sys.locked) h.sprite(`hk${sys.id}`, texNow("icons/s_hacked.png"), cx + 10, SUB_ICON_Y + 12, { anchor: 0.5 });
      if (sys.id === "battery") this.batteryPanel(s, sys, cx - 36, 690);
      if (icon) {
        if (sys.ion <= 0 && this.lockLeft(s, sys.id) <= 0) h.sprite(`ssi${sys.id}`, icon, this.subX0(s) + i * SYS_DX, SUB_ICON_Y, { tint: sys.hacked ? 0xd070ff : 0xffffff });
      } else if (sys.ion <= 0) h.text(`ssi${sys.id}`, sys.id.slice(0, 3).toUpperCase(), cx, SUB_ICON_Y + 32, fstyle("JustinFont10", 0xffffff), [0.5, 0.5]);
    });
    this.doorBtns = [];
    if (s.systems.doors) {
      // FTL's door controls stand over the doors subsystem.
      const bx = this.subX0(s) + SUB_SYS.filter((x) => s.systems[x]).indexOf("doors") * SYS_DX + 35;
      const by = 597;
      const base = texNow("systemUI/button_door_base.png");
      if (base) {
        h.sprite("doorB", base, bx, by);
        h.sprite("doorT", texNow("systemUI/button_door_top_on.png"), bx, by);
        h.sprite("doorD", texNow("systemUI/button_door_bottom_on.png"), bx, by);
      } else h.gfx("doorBG").roundRect(bx + 4, by + 4, 32, 70, 4).stroke({ color: 0xe8ece8, width: 2 });
      this.doorBtns = [
        { open: false, box: { x: bx, y: by, w: 40, h: 38 } },
        { open: true, box: { x: bx, y: by + 38, w: 40, h: 40 } },
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
    if (boxT) h.sprite("wbox", boxT, TRAY.x + this.trayDx, TRAY.y);
    else g.roundRect(TRAY.x + this.trayDx + 6, TRAY.y + 6, 20 + slots * SLOT.dx, 64, 4).fill({ color: 0x1a1f22, alpha: 0.9 }).stroke({ color: 0xe8ece8, width: 2 });
    this.label("wlabT", "WEAPONS", 252 + this.trayDx, 667);
    for (let i = 0; i < slots; i++) {
      const bx = SLOT.x + this.trayDx + i * SLOT.dx;
      const by = SLOT.y;
      const w = s.weapons[i];
      if (!w) {
        g.rect(bx + 1, by + 1, SLOT.w - 2, SLOT.h - 2).stroke({ color: 0x8a8e8a, width: 2 });
        continue;
      }
      const bp = this.db.weapons[w.bp];
      const armed = this.armed === i;
      const ready = w.powered && w.volleys > 0;
      const dragging = this.weaponDrag?.moved && this.weaponDrag.slot === i;
      const edge = dragging ? 0xffffff : armed ? 0xffd040 : w.powered ? 0x78ff78 : 0x8a8e8a;
      if (ready) {
        const glow = texNow("bar_weapon_minibox_glow.png");
        if (glow) h.sprite(`wg${i}`, glow, bx - 17, by - 13, { w: SLOT.w + 34, h: SLOT.h + 26, tint: armed ? 0xffd040 : 0x78ff78, alpha: 0.55 });
      }
      g.rect(bx + 1, by + 1, SLOT.w - 2, SLOT.h - 2).fill({ color: armed ? 0x3a3010 : ready ? 0x1d3a1f : 0x0f1414, alpha: 0.9 }).stroke({ color: edge, width: 2 });
      // Charge: a thin vertical bar filling from the bottom in 2 px steps. Manning and chain boosts don't
      // speed it up; they lower its ceiling (the bar's top comes down to the shorter charge time).
      const baseCd = bp?.cooldown ?? 1;
      const cd = w.cd ?? baseCd;
      const full = SLOT.h - 10;
      const ceil = Math.max(4, Math.round((full * Math.min(1, cd / baseCd)) / 2) * 2);
      const k = ready ? 1 : Math.min(1, Math.max(0, w.charge) / cd);
      const fill = Math.floor((ceil * k) / 2) * 2;
      g.rect(bx + 4.5, by + 4.5, 5, full + 1).stroke({ color: w.powered ? 0x506a50 : 0x5a5e5a, width: 1 });
      g.rect(bx + 4.5, by + 4.5 + (full - ceil), 5, ceil + 1).stroke({ color: w.powered ? 0x78ff78 : 0x8a8e8a, width: 1 });
      if (fill > 0) g.rect(bx + 5, by + 5 + full - fill, 4, fill).fill({ color: 0x78ff78 });
      // Chain weapons: one pip per possible boost, lit as charges build up.
      if (bp?.boost) {
        const on = texNow("combatUI/icon_chain_on.png");
        const off = texNow("combatUI/icon_chain_off.png");
        for (let c = 0; c < bp.boost.count; c++) {
          const lit = c < w.boost;
          if (on && off) h.sprite(`ch${i}_${c}`, lit ? on : off, bx + 34 + c * 12, by + SLOT.h - 13);
          else g.rect(bx + 34 + c * 10, by + SLOT.h - 12, 8, 6).fill({ color: lit ? 0xffd040 : 0x303030 });
        }
      }
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
      // Slot number tag in the bottom-right corner.
      g.rect(bx + SLOT.w - 12, by + SLOT.h - 12, 11, 11).fill({ color: 0x0f1414 }).stroke({ color: edge, width: 1 });
      h.text(`wnum${i}`, String(i + 1), bx + SLOT.w - 6.5, by + SLOT.h - 12, fstyle("JustinFont8", 0xe8ece8), [0.5, 0]);
      if (w.autofire) h.text(`wa${i}`, "AUTO", bx + SLOT.w - 15, by + SLOT.h - 12, fstyle("JustinFont8", 0xffd040), [1, 0]);
      this.weapHit.push({ slot: i, box: { x: bx, y: by, w: SLOT.w, h: SLOT.h } });
    }
    // AUTOFIRE: a tab under the right end of the tray, lit when any weapon autofires.
    const anyAuto = this.autoMode;
    const ax = 527 + this.trayDx;
    const ay = 668;
    const ab = h.gfx("autoBtn");
    ab.poly([ax + 6, ay, ax + 112, ay, ax + 118, ay + 6, ax + 118, ay + 24, ax + 112, ay + 29, ax + 6, ay + 29, ax, ay + 24, ax, ay + 6])
      .fill({ color: anyAuto ? 0xd8e8b0 : 0x98a8a4 })
      .stroke({ color: anyAuto ? 0xfff2a0 : 0xd8e4dc, width: 2 });
    this.label("autoT", "AUTOFIRE", ax + 59, ay + 3, anyAuto ? 0x3a3a10 : 0x2a3434, anyAuto ? 0xfff8d0 : 0xc8d4d0, [0.5, 0]);
    this.autoBox = { x: ax, y: ay, w: 118, h: 29 };
    void soundOn;
  }

  private droneHit: { slot: number; box: Box }[] = [];

  /** Drone tray to the right of the weapons: one box per drone slot; click to launch, right-click to recall. */
  private droneTray(s: ShipView): void {
    const h = this.hud;
    this.droneHit = [];
    const slots = this.db.ships[s.bp]?.droneSlots ?? 0;
    if (!slots || !s.systems.drones) return;
    const n = Math.max(2, Math.min(4, slots));
    // Flush to the right of the weapons tray, as in FTL.
    const x0 = this.lay.droneX0;
    const dy = 0;
    const boxT = texNow(`box_weapons_bottom${n}.png`);
    const g = h.gfx("dtray");
    if (boxT) h.sprite("dbox", boxT, x0, TRAY.y + dy);
    else g.roundRect(x0 + 6, TRAY.y + dy + 6, 20 + n * SLOT.dx, 64, 4).fill({ color: 0x1a1f22, alpha: 0.9 }).stroke({ color: 0xe8ece8, width: 2 });
    this.label("dlabT", "DRONES", x0 + 18, 667 + dy);
    for (let i = 0; i < n; i++) {
      const bx = x0 + 17 + i * SLOT.dx;
      const by = SLOT.y + dy;
      const d = (s.drones ?? [])[i];
      const bp = d && this.db.droneBPs[d.bp];
      if (!d || !bp || i >= slots) {
        g.rect(bx + 1, by + 1, SLOT.w - 2, SLOT.h - 2).stroke({ color: 0x8a8e8a, width: 2 });
        continue;
      }
      const usableHere = ACTIVE_DRONES.includes(bp.type);
      const edge = d.deployed ? 0x78ff78 : d.powered ? 0xffd040 : 0x8a8e8a;
      g.rect(bx + 1, by + 1, SLOT.w - 2, SLOT.h - 2).fill({ color: d.deployed ? 0x1d3a1f : 0x0f1414, alpha: 0.9 }).stroke({ color: edge, width: 2 });
      for (let p = 0; p < bp.power; p++) {
        const py = by + SLOT.h - 11 - p * 8;
        if (d.powered) g.rect(bx + 5, py, 16, 6).fill({ color: 0x78ff78 });
        else g.rect(bx + 5.5, py + 0.5, 15, 5).stroke({ color: 0x8a8e8a, width: 1 });
      }
      const short = bp.title.replace(/ Drone/, "").replace("Mark ", "").trim();
      h.text(`dn${i}`, short.length > 14 ? `${short.slice(0, 13)}.` : short, bx + 54, by + 4, fstyle("JustinFont10", usableHere ? (d.powered ? 0xffffff : 0x9aa09a) : 0x707070), [0.5, 0]);
      const status = (d.rebuild ?? 0) > 0 ? `rebuilding ${Math.ceil(d.rebuild ?? 0)}s` : !usableHere ? "coming later" : d.deployed ? (bp.type === "SHIP_REPAIR" ? `repair ${d.repairLeft ?? 0}` : "deployed") : d.powered ? ((s.droneParts ?? 0) > 0 ? "launching" : "no parts") : "";
      if (status) h.text(`ds${i}`, status, bx + 26, by + SLOT.h - 12, fstyle("JustinFont8", d.deployed ? 0x9fe89f : 0xffd040));
      this.droneHit.push({ slot: i, box: { x: bx, y: by, w: SLOT.w, h: SLOT.h } });
    }
  }

  /** Where a deployed drone is on screen: combat drones orbit the enemy, the rest orbit their own ship. */
  private dronePos(owner: 0 | 1, slot: number): { x: number; y: number } | null {
    const v = this.view;
    if (!v) return null;
    const d = v.ships[owner].drones?.[slot];
    const bp = d && this.db.droneBPs[d.bp];
    if (!d || !bp || !d.deployed) return null;
    const aroundEnemy = bp.type === "COMBAT";
    const r = (owner === v.you) !== aroundEnemy ? this.own : this.enemy;
    const b = r.bounds();
    const c = r.gridCentre();
    const lx = c.x + Math.cos(d.angle) * (b.w / 2 + 30);
    const ly = c.y + Math.sin(d.angle) * (b.h / 2 + 24);
    return this.stage.toLocal(r.root.toGlobal({ x: lx, y: ly }));
  }

  /** Where each drone (`ship:slot`) last aimed, in stage coordinates. */
  private droneAim = new Map<string, { x: number; y: number }>();

  private drawDrones(v: MatchView): void {
    // Hacking drones sit on the room they hacked (FTL's landing strip, last frame), lights blinking while pulsing.
    for (const s of v.ships) {
      if (!s.hack?.attached) continue;
      const r = s.idx === v.you ? this.enemy : this.own;
      const tiles = r.geo.roomTiles.get(s.hack.room);
      const strip = texNow("ship/drones/drone_hack_land.png");
      if (!tiles?.length || !strip) continue;
      const xs = tiles.map((t) => Number(t.split(",")[0]));
      const ys = tiles.map((t) => Number(t.split(",")[1]));
      const c = this.stage.toLocal(r.root.toGlobal({ x: ((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * 35, y: ((Math.min(...ys) + Math.max(...ys)) / 2 + 0.5) * 35 }));
      const sp = new Sprite(frame(strip, 4 * 31, 0, 31, 49));
      sp.anchor.set(0.5);
      sp.position.set(c.x, c.y);
      (s.idx === v.you ? this.projWin : this.projOwn).addChild(sp);
      if (s.hack.pulse > 0) {
        const lt = texNow(Math.floor(this.time * 6) % 2 ? "ship/drones/drone_hack_light1.png" : "ship/drones/drone_hack_light2.png");
        if (lt) {
          const l = new Sprite(frame(lt, 4 * 31, 0, Math.min(31, lt.width), Math.min(49, lt.height)));
          l.anchor.set(0.5);
          l.position.set(c.x, c.y);
          (s.idx === v.you ? this.projWin : this.projOwn).addChild(l);
        }
      }
    }
    const layerFor = (owner: 0 | 1, type: string) => ((owner === v.you) !== (type === "COMBAT") ? this.projOwn : this.projWin);
    for (const owner of [0, 1] as const) {
      for (const d of v.ships[owner].drones ?? []) {
        const bp = this.db.droneBPs[d.bp];
        if (!bp || !d.deployed || UNIT_DRONES.includes(bp.type)) continue;
        const p = this.dronePos(owner, d.slot);
        if (!p) continue;
        const t = texNow(`ship/drones/${bp.image}_on.png`) ?? texNow(`ship/drones/${bp.image}_base.png`) ?? texNow(`ship/drones/${bp.image}_off.png`);
        const layer = layerFor(owner, bp.type);
        // The art points up: turn it toward what it last shot at, else the ship it circles (combat) or
        // away from its own ship (defense, repair).
        const r = (owner === v.you) !== (bp.type === "COMBAT") ? this.own : this.enemy;
        const c = this.stage.toLocal(r.root.toGlobal(r.gridCentre()));
        const aim = this.droneAim.get(`${owner}:${d.slot}`);
        const face = bp.type === "COMBAT" ? (aim ?? c) : { x: 2 * p.x - c.x, y: 2 * p.y - c.y };
        const rot = Math.atan2(face.y - p.y, face.x - p.x) + Math.PI / 2;
        if (t) {
          const sp = new Sprite(t);
          sp.anchor.set(0.5);
          sp.position.set(p.x, p.y);
          sp.scale.set(0.8);
          sp.rotation = bp.type === "DEFENSE" ? 0 : rot;
          if (owner !== v.you) sp.tint = 0xffd0d0;
          layer.addChild(sp);
          // Defense drones: a gun turret on top, turned toward the last shot it took down.
          const gun = bp.type === "DEFENSE" ? texNow(`ship/drones/${bp.image}_gun_on.png`) ?? texNow(`ship/drones/${bp.image}_gun.png`) : null;
          if (gun) {
            const gs = new Sprite(gun);
            gs.anchor.set(0.5);
            gs.position.set(p.x, p.y);
            gs.scale.set(0.8);
            gs.rotation = aim ? Math.atan2(aim.y - p.y, aim.x - p.x) + Math.PI / 2 : rot;
            if (owner !== v.you) gs.tint = 0xffd0d0;
            layer.addChild(gs);
          }
        } else layer.addChild(new Graphics().circle(p.x, p.y, 7).fill({ color: owner === v.you ? 0x6ab4ff : 0xff6a5a }).stroke({ color: 0xffffff, width: 1.5 }));
      }
    }
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
      return;
    }
    if (this.autoBox && inBox(p, this.autoBox)) {
      // AUTOFIRE sets the default for new targets (and applies to weapons already targeting).
      this.autoMode = !this.autoMode;
      own.weapons.forEach((w, slot) => w.target && this.send({ c: "autofire", slot, on: this.autoMode }));
      play(this.db, [this.autoMode ? "autofireOn" : "autofireOff"]);
      this.say(this.autoMode ? "Autofire on" : "Autofire off");
      return;
    }
    for (const w of this.weapHit) {
      if (!inBox(p, w.box)) continue;
      if (right) return this.clickWeapon(w.slot, true);
      // Left button: a click (power/arm) unless it turns into a drag onto another slot.
      this.weaponDrag = { slot: w.slot, x: p.x, y: p.y, moved: false };
      return;
    }
    for (const dh of this.droneHit) {
      if (!inBox(p, dh.box)) continue;
      const d = own.drones?.[dh.slot];
      const bp = d && this.db.droneBPs[d.bp];
      if (!d || !bp) return;
      if (right) {
        if (d.powered) {
          this.send({ c: "dronePower", slot: dh.slot, on: false });
          play(this.db, ["powerDownSystem"]);
        }
        return;
      }
      if (d.powered) return;
      if ((d.rebuild ?? 0) > 0) return this.fail("That drone is still being rebuilt");
      if (!ACTIVE_DRONES.includes(bp.type)) return this.fail("This drone isn't in the arena yet");
      const ds = own.systems.drones;
      if (!ds || ds.ion > 0) return this.fail(ds ? "Drones are locked by ion damage" : "No drone system");
      const load = (own.drones ?? []).filter((q) => q.powered).reduce((a, q) => a + (this.db.droneBPs[q.bp]?.power ?? 1), 0);
      if (load + bp.power > usable(ds)) return this.fail("Not enough drone system power");
      if ((own.droneParts ?? 0) <= 0) return this.fail("No drone parts left");
      play(this.db, ["powerUpSystem", "droneLaunch"]);
      this.send({ c: "dronePower", slot: dh.slot, on: true });
      return;
    }
    for (const b of this.stationBtns) {
      if (!inBox(p, b.box)) continue;
      const g = this.own.geo;
      if (b.kind === "assign") {
        for (const c of own.crew) if (!c.dead && c.owner === v.you && c.drone === undefined) this.savedStations.set(c.id, g.tiles.get(c.home)!.room);
        play(this.db, ["powerUpSystem"]);
        this.say("Crew positions saved");
      } else {
        if (!this.savedStations.size) return this.fail("No crew positions saved yet");
        for (const [id, room] of this.savedStations) if (own.crew.find((c) => c.id === id && !c.dead)) this.send({ c: "moveCrew", crew: [id], room });
        play(this.db, ["powerUpSystem"]);
        this.say("Crew returning to saved positions");
      }
      return;
    }
    for (const c of this.crewHit) {
      if (!inBox(p, c.box)) continue;
      if (!e.shiftKey) this.selected.clear();
      this.selected.add(c.id);
      return;
    }
    for (const b of this.teleBtns) {
      if (!inBox(p, b.box)) continue;
      if (right) return void (this.teleMode = null);
      return this.teleClick(own, b.out);
    }
    if (this.telePanelBox && this.teleWhy && inBox(p, this.telePanelBox)) return this.fail(this.teleWhy);
    if (this.batteryBtn && inBox(p, this.batteryBtn) && !right) {
      play(this.db, ["batteryStart"]);
      return this.send({ c: "battery" });
    }
    if (this.mindBtn && inBox(p, this.mindBtn) && !right) {
      play(this.db, ["powerUpSystem"]);
      this.teleMode = "mind";
      return;
    }
    if (this.artilleryBtn && inBox(p, this.artilleryBtn)) {
      if (right) return this.send({ c: "artilleryTarget", room: null });
      play(this.db, ["powerUpSystem"]);
      this.teleMode = "artillery";
      return;
    }
    if (this.cloakBtn && inBox(p, this.cloakBtn) && !right) {
      play(this.db, ["cloak"]);
      return this.send({ c: "cloak" });
    }
    for (const b of this.hackBtns) {
      if (!inBox(p, b.box) || right) continue;
      if (b.kind === "pulse") {
        play(this.db, ["hackStart"]);
        return this.send({ c: "hackPulse" });
      }
      play(this.db, ["powerUpSystem"]);
      this.teleMode = "hack";
      return;
    }
    const ep = this.enemy.root.toLocal(e.global);
    const eh = inBox(p, WIN) ? this.enemy.pick(ep.x, ep.y) : { room: -1, door: -1 };
    if (this.teleMode) {
      const mode = this.teleMode;
      const out = mode === "send";
      this.teleMode = null;
      if (right) {
        if (mode === "artillery") this.send({ c: "artilleryTarget", room: null });
        return;
      }
      if (mode === "mind") {
        // Either ship: enemy crew over there, or intruders at home.
        const oh2 = this.own.pick(this.own.root.toLocal(e.global).x, this.own.root.toLocal(e.global).y);
        if (eh.room >= 0) return this.send({ c: "mind", room: eh.room, enemy: true });
        if (oh2.room >= 0) return this.send({ c: "mind", room: oh2.room, enemy: false });
        return this.fail("Pick a room with enemy crew");
      }
      if (eh.room < 0) return this.fail("Pick a room on the enemy ship");
      if (mode === "artillery") {
        this.say("Artillery aimed");
        return this.send({ c: "artilleryTarget", room: eh.room });
      }
      if (mode === "hack") {
        play(this.db, ["droneLaunch"]);
        return this.send({ c: "hackLaunch", room: eh.room });
      }
      // The server decides, but say why it would refuse (FTL's own warning for super shields).
      const enV2 = v.ships[1 - v.you];
      if ((enV2.superShield ?? 0) > 0) return this.fail("Super shields prevent teleporting");
      if (out) {
        const eg = this.enemy.geo;
        const free = (eg.roomTiles.get(eh.room) ?? []).filter((t) => !enV2.crew.some((c) => c.owner === v.you && !c.dead && c.tile === t)).length;
        if (!free) return this.fail("That room is full");
      } else if (!enV2.crew.some((c) => c.owner === v.you && !c.dead && c.drone === undefined && this.enemy.geo.tiles.get(c.tile)?.room === eh.room)) {
        return this.fail("None of your crew are in that room");
      }
      play(this.db, ["teleport"]);
      return this.send({ c: out ? "teleport" : "retrieve", room: eh.room });
    }
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
        this.send({ c: "autofire", slot: this.armed, on: this.autoMode !== e.shiftKey });
        return this.disarm();
      }
      if (eh.room >= 0) {
        // Autofire for this target: the AUTOFIRE mode, inverted while Shift is held (FTL's rule).
        const auto = this.autoMode !== e.shiftKey;
        this.send({ c: "target", slot: this.armed, target: { kind: "room", room: eh.room } });
        this.send({ c: "autofire", slot: this.armed, on: auto });
        return this.disarm();
      }
      return;
    }
    const op = this.own.root.toLocal(e.global);
    const oh = this.own.pick(op.x, op.y);
    const enV = v.ships[1 - v.you];
    if (right) {
      // Selected crew move within the ship they're aboard: boarders on the enemy, the rest at home.
      const aboardEnemy = [...this.selected].filter((id) => enV.crew.some((c) => c.id === id));
      const atHome = [...this.selected].filter((id) => own.crew.some((c) => c.id === id));
      if (eh.room >= 0 && aboardEnemy.length) this.send({ c: "moveCrew", crew: aboardEnemy, room: eh.room, enemy: true });
      else if (oh.room >= 0 && atHome.length) this.send({ c: "moveCrew", crew: atHome, room: oh.room });
      return;
    }
    // Clicking own boarders on the enemy ship selects them.
    const boarder = eh.room >= 0 ? enV.crew.find((c) => c.owner === v.you && c.drone === undefined && !c.dead && Math.hypot(c.x + 0.5 - ep.x / 35, c.y + 0.5 - ep.y / 35) < 0.45) : undefined;
    if (boarder) {
      if (!e.shiftKey) this.selected.clear();
      this.selected.add(boarder.id);
      return;
    }
    if (oh.door >= 0) {
      const open = !own.doors[oh.door];
      this.send({ c: "door", door: oh.door, open });
      return;
    }
    const hit = own.crew.find((c) => !c.dead && c.owner === v.you && c.drone === undefined && Math.hypot(c.x + 0.5 - op.x / 35, c.y + 0.5 - op.y / 35) < 0.45);
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
    if (SUBSYSTEMS.includes(id)) return this.fail("Subsystems are powered by their own level");
    if (s.ion > 0) return this.fail("System is locked by ion damage");
    if (s.locked) return this.fail("System locked: an enemy hacking drone is attached");
    const used = Object.values(own.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
    if (id === "weapons") {
      // Clicking the weapons system powers the next weapon in slot order (right-click: the last one).
      if (delta > 0) {
        const i = own.weapons.findIndex((w) => !w.powered);
        if (i < 0) return this.fail("All weapons are powered");
        return this.clickWeapon(i, false);
      }
      const powered = own.weapons.map((w, i) => (w.powered ? i : -1)).filter((i) => i >= 0);
      if (!powered.length) return this.fail("No weapons are powered");
      return this.clickWeapon(powered[powered.length - 1], true);
    }
    if (id === "drones") {
      // Like weapons: the next drone in slot order launches; right-click recalls the last powered one.
      const ds = own.drones ?? [];
      if (delta > 0) {
        const i = ds.findIndex((d) => !d.powered && !(d.rebuild ?? 0) && ACTIVE_DRONES.includes(this.db.droneBPs[d.bp]?.type ?? ""));
        if (i < 0) return this.fail("No drone ready to launch");
        const hit = this.droneHit.find((x) => x.slot === i);
        if (hit) return this.onDown({ global: this.stage.toGlobal({ x: hit.box.x + 5, y: hit.box.y + 5 }), button: 0, shiftKey: false } as unknown as FederatedPointerEvent);
        return;
      }
      const powered = ds.map((d, i) => (d.powered ? i : -1)).filter((i) => i >= 0);
      if (!powered.length) return void play(this.db, ["powerUpFail"]);
      play(this.db, ["powerDownSystem"]);
      return this.send({ c: "dronePower", slot: powered[powered.length - 1], on: false });
    }
    if (delta > 0 && used >= own.reactor) return this.fail("Not enough available power");
    if (delta > 0 && s.power >= usable(s)) return this.fail(s.damage > 0 ? "System is damaged" : "System is at full power");
    if (delta < 0 && s.power <= 0) return void play(this.db, ["powerUpFail"]);
    play(this.db, [delta > 0 ? "powerUpSystem" : "powerDownSystem"]);
    this.send({ c: "power", system: id, delta });
  }

  /** FTL's red message above the tray, with the refusal sound. */
  private fail(msg: string): void {
    play(this.db, ["powerUpFail"]);
    this.say(msg, 0xff5a50);
  }

  private message: { text: string; color: number; until: number } | null = null;
  private say(text: string, color = 0xe8ece8): void {
    this.message = { text, color, until: this.time + 2.2 };
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
    this.mouse = { x: p.x, y: p.y };
    this.hoverCrew = null;
    const v = this.view;
    if (v) {
      for (const c of this.crewHit) if (inBox(p, c.box)) this.hoverCrew = { id: c.id, mine: true };
      const near = (s: ShipView, lx: number, ly: number) => s.crew.find((c) => !c.dead && !c.blip && Math.hypot(c.x + 0.5 - lx / 35, c.y + 0.5 - ly / 35) < 0.42);
      const mineHit = !this.hoverCrew && p.x < OWN.clipX ? near(v.ships[v.you], op.x, op.y) : undefined;
      if (mineHit) this.hoverCrew = { id: mineHit.id, mine: true };
      const theirs = !this.hoverCrew && inBox(p, WIN) ? near(v.ships[1 - v.you], ep.x, ep.y) : undefined;
      if (theirs) this.hoverCrew = { id: theirs.id, mine: false };
    }
    // Dragging a weapon box: once it moves, the weapon swaps into whichever slot it's held over, live.
    if (this.weaponDrag && Math.hypot(p.x - this.weaponDrag.x, p.y - this.weaponDrag.y) > 8) {
      this.weaponDrag.moved = true;
      const d = this.weaponDrag;
      const own = this.view?.ships[this.view.you];
      for (let i = 0; i < 4; i++) {
        const box = { x: SLOT.x + this.trayDx + i * SLOT.dx, y: SLOT.y, w: SLOT.w, h: SLOT.h };
        if (!inBox(p, box) || i === d.slot || !own?.weapons[i]) continue;
        this.send({ c: "swapWeapons", a: d.slot, b: i });
        if (this.armed === d.slot) this.armed = i;
        else if (this.armed === i) this.armed = d.slot;
        play(this.db, ["hoverBeep"]);
        d.slot = i;
        break;
      }
    }
  }

  private weaponDrag: { slot: number; x: number; y: number; moved: boolean } | null = null;

  private onUp(e: FederatedPointerEvent): void {
    const v = this.view;
    if (this.weaponDrag && v) {
      const d = this.weaponDrag;
      this.weaponDrag = null;
      const p = this.stage.toLocal(e.global);
      void p;
      if (!d.moved) return this.clickWeapon(d.slot, false);
      play(this.db, ["powerUpSystem"]);
      return;
    }
    if (!this.drag || !v) return;
    const d = this.drag;
    this.drag = null;
    if (Math.hypot(d.x2 - d.x, d.y2 - d.y) < 6) {
      if (!e.shiftKey) this.selected.clear();
      return;
    }
    // Box-select your crew on either ship: each crew member's on-screen spot (the enemy view is rotated
    // and scaled) tested against the box in stage space.
    const x1 = Math.min(d.x, d.x2), x2 = Math.max(d.x, d.x2), y1 = Math.min(d.y, d.y2), y2 = Math.max(d.y, d.y2);
    if (!e.shiftKey) this.selected.clear();
    for (const [ship, r] of [[v.ships[v.you], this.own], [v.ships[1 - v.you], this.enemy]] as const) {
      for (const c of ship.crew) {
        if (c.dead || c.owner !== v.you || c.drone !== undefined || c.mind) continue;
        const p = this.stage.toLocal(r.root.toGlobal({ x: (c.x + 0.5) * 35, y: (c.y + 0.5) * 35 }));
        if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) this.selected.add(c.id);
      }
    }
  }

  private clickWeapon(slot: number, right: boolean): void {
    const own = this.view!.ships[this.view!.you];
    const w = own.weapons[slot];
    if (!w) return;
    const bp = this.db.weapons[w.bp];
    if (right) {
      if (w.powered) {
        if (own.systems.weapons && own.systems.weapons.ion > 0) return this.fail("Weapons are locked by ion damage");
        this.send({ c: "weaponPower", slot, on: false });
        play(this.db, ["powerDownSystem"]);
      }
      if (this.armed === slot) this.disarm();
      return;
    }
    if (!w.powered) {
      const ws = own.systems.weapons;
      if (ws && ws.ion > 0) return this.fail("Weapons are locked by ion damage");
      const load = own.weapons.filter((q) => q.powered).reduce((a, q) => a + (this.db.weapons[q.bp]?.power ?? 1), 0);
      const need = load + (bp?.power ?? 1);
      const used = Object.values(own.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
      const extra = Math.max(0, need - (ws ? ws.power + (ws.bonus ?? 0) : 0));
      if (!ws || need > usable(ws)) return this.fail("Not enough weapon system power");
      if (used + extra > own.reactor) return this.fail("Not enough available power");
      play(this.db, ["powerUpSystem"]);
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
    else if (e.key.toLowerCase() === "m") {
      setSound(!soundOn());
      this.say(soundOn() ? "Sound on" : "Sound off");
    } else if (e.key.toLowerCase() === "n") {
      setMusic(!musicEnabled());
      this.say(musicEnabled() ? "Music on" : "Music off");
    }
    else if (e.key.toLowerCase() === "z") {
      this.send({ c: "doorsAll", open: true });
    } else if (e.key.toLowerCase() === "x") {
      this.send({ c: "doorsAll", open: false });
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.selected = new Set(this.myCrew(this.view!).filter((c) => !c.dead).map((c) => c.id));
    }
  }
}

export const LOGICAL = { W, H };
