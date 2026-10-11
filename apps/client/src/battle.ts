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
import { RULES, SNAP_HZ, SURVIVAL, usable, type Command, type MatchView, type ShipView, type WeaponTarget } from "./simlite.ts";
import type { SurvivalState } from "@ftl/protocol";
import { animFrame, frame, texNow } from "./assets.ts";
import { loop, music, musicEnabled, pickBattleTrack, play, setMusic, stopLoops, timeStop } from "./audio.ts";
import { fstyle, Imm } from "./imm.ts";
import { attackPhase, LOW_HP, SHOT_AT, ShipRenderer, type CrewDraw } from "./render/ship.ts";

const W = 1280;
const H = 720;
/** Own-ship view: the ship is centred where FTL centres the player's ship. */
const OWN = { cx: 467, cy: 346, w: 700, h: 470, clipX: 868 };
/** FTL's hostiles window (box_hostiles2) and the part of it the enemy ship is fitted into. */
const WIN = { x: 870, y: 45, w: 410, h: 555 };
const WIN_SHIP = { x: WIN.x + 18, y: WIN.y + 104, w: 366, h: 372 };
/** FTL's order for the bottom-left system row (its SortingType): the weapons and drone trays sit inline after
 * their systems, which is why they come last. */
const MAIN_SYS: SystemId[] = ["shields", "engines", "medbay", "clonebay", "oxygen", "teleporter", "cloaking", "artillery", "mind", "hacking", "weapons", "drones"];
/** Systems whose button stands beside their bars, so they take 54 px of the row instead of 36. */
const BUTTON_SYS: SystemId[] = ["teleporter", "cloaking", "mind", "hacking"];
const ACTIVE_DRONES = ["COMBAT", "DEFENSE", "SHIP_REPAIR", "BATTLE", "REPAIR", "BOARDER", "SHIELD"];
const UNIT_DRONES = ["BATTLE", "REPAIR", "BOARDER"];
const SUB_SYS: SystemId[] = ["pilot", "sensors", "doors", "battery"];
/** Each subsystem's fixed spot in FTL's group (icon left edge past SUB_X0); the battery stands right-most. */
const SUB_OFF: Partial<Record<SystemId, number>> = { pilot: 0, sensors: 36, doors: 72, battery: 123 };
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
/** Seconds of blasts across a dying ship's intact hull before it breaks apart. */
const EXPLODE_PRE = 1.4;
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
  /** A cold blue wash over the battle while time is stopped. */
  private pauseTint = new Graphics().rect(0, 0, W, H).fill({ color: 0x1a3060 });
  /** Animation clock: stands still while the match is paused, so fires, crew and drones freeze too. */
  private animTime = 0;
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
  private walking = new Map<string, string>();
  private flashTiles = new Map<string, number>();
  private flashTilesEnemy = new Map<string, number>();
  private explodedAt = new Map<number, number>();
  private endReadyAt: number | null = null;
  private hullMaskSprite: Sprite | null = null;
  /** Per-shot firing: projectile ids already launched, and the last shot time per `${ship}:${slot}`. */
  private launched = new Set<number>();
  private beamSounded = new Set<number>();
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
    this.stage.addChild(this.bgLayer, this.world, this.pauseTint, this.flash, this.hudRoot);
    this.flash.alpha = 0;
    this.stage.eventMode = "static";
    this.stage.hitArea = { contains: () => true };
    this.stage.on("pointerdown", (e) => this.onDown(e));
    this.stage.on("pointermove", (e) => this.onMove(e));
    this.stage.on("pointerup", (e) => this.onUp(e));
    window.addEventListener("keydown", this.keyHandler);
  }

  destroy(): void {
    stopLoops();
    timeStop(false);
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
    const bg = texNow(`stars/${this.backdrop?.bg ?? "bg_darknebula"}.png`) ?? texNow("stars/bg_darknebula.png");
    if (bg) {
      const s = new Sprite(bg);
      s.width = W;
      s.height = H;
      this.bgLayer.addChild(s);
    }
    // A new beacon (Survival): a planet off in the distance, behind the ships.
    const pt = this.backdrop?.planet ? texNow(`stars/${this.backdrop.planet}.png`) : null;
    if (pt) {
      const p = new Sprite(pt);
      p.anchor.set(0.5);
      p.position.set(this.backdrop!.px * W, this.backdrop!.py * H);
      p.alpha = 0.85;
      this.bgLayer.addChild(p);
    }
    this.hazardScenery(v);
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

  /** The hazard's backdrop, FTL's art: the red giant, the pulsar, asteroids drifting past, nebula clouds. */
  private hazardScenery(v: MatchView): void {
    const k = v.hazard?.kind;
    const add = (file: string, x: number, y: number, o: { scale?: number; alpha?: number; tint?: number } = {}) => {
      const t = texNow(file);
      if (!t) return null;
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.scale.set(o.scale ?? 1);
      s.alpha = o.alpha ?? 1;
      if (o.tint !== undefined) s.tint = o.tint;
      this.bgLayer.addChild(s);
      return s;
    };
    // In the background's corners, clear of both ships.
    if (k === "sun") add("stars/planet_sun1.png", 40, 700, { scale: 0.55, alpha: 0.9 });
    else if (k === "pulsar") {
      add("effects/pulsar_backL.png", 640, 660, { scale: 0.8, alpha: 0.55 });
      add("effects/pulsar_frontL.png", 640, 660, { scale: 0.8, alpha: 0.8 });
    } else if (k === "asteroids") {
      for (const [i, [x, y]] of [[300, 150], [900, 560], [640, 360]].entries()) {
        const s = add(`asteroids/asteroid_back${i + 1}.png`, x, y, { scale: 1.4, alpha: 0.7 });
        if (s) this.drift.push(s);
      }
    } else if (k === "nebula" || k === "storm") {
      for (let i = 0; i < 9; i++) add(`stars/nebula_large_${"abc"[i % 3]}.png`, 100 + ((i * 397) % 1100), 80 + ((i * 251) % 560), { scale: 4, alpha: 0.55, tint: k === "storm" ? 0xc070ff : 0x9080ff });
    }
  }
  /** Background rocks that drift slowly across. */
  private drift: Sprite[] = [];
  /** A full-screen flash: a flare's white-orange, a pulse's blue. */
  private flash = new Graphics().rect(0, 0, W, H).fill({ color: 0xffffff });
  private flashAt = -9;
  private flashColor = 0xffffff;

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
    // The aimed gun lost its power (a right-click, the system bars, damage, ion, or an order queued in a
    // pause that lands on unpause): drop the targeting mode with it.
    if (this.armed !== null && this.prev.ships[v.you].weapons[this.armed]?.powered && !v.ships[v.you].weapons[this.armed]?.powered) this.disarm();
    // Saved positions start as everyone's starting spot, so "return to stations" works before any save.
    if (!this.savedStations.size) {
      const g = this.own.geo;
      for (const c of v.ships[v.you].crew) if (c.owner === v.you && c.drone === undefined && !c.dead) this.savedStations.set(c.id, g.tiles.get(c.home)!.room);
    }
    this.soundscape(v);
    this.snapAt = performance.now();
    for (const e of v.events) this.onEvent(e);
    const own = v.ships[v.you];
    const mine = this.myCrew(v);
    for (const id of [...this.selected]) if (!mine.find((c) => c.id === id && !c.dead && c.dying === undefined)) this.selected.delete(id);
    // Destination tiles flash as crew arrive, on whichever ship they're walking (boarders too).
    for (const [ship, flash] of [[own, this.flashTiles], [v.ships[1 - v.you], this.flashTilesEnemy]] as const) {
      for (const c of ship.crew) {
        if (c.owner !== v.you || c.drone !== undefined) continue;
        const key = `${ship.idx}:${c.id}`;
        const was = this.walking.get(key);
        if (c.path.length) this.walking.set(key, c.home);
        else if (was) {
          flash.set(was, 0.45);
          this.walking.delete(key);
        }
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
        // Artillery (the flagship's guns): their fire frames on the hull.
        if (e.slot <= -2) this.rOf(e.ship).artilleryFired[-2 - e.slot] = this.animTime;
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
      case "hit": {
        // Each weapon's own impact (missiles have their own explosions); beams sizzle as they sweep instead.
        const bp = e.weapon ? this.db.weapons[e.weapon] : undefined;
        if (bp?.type === "BEAM") break;
        this.boom(e.ship, e.px, e.py, e.damage > 0 ? 1 : 0.7);
        play(this.db, bp?.sounds?.hit?.length ? bp.sounds.hit : ["hitHull2", "hitHull3", "smallExplosion"]);
        break;
      }
      case "shield": {
        const bp = e.weapon ? this.db.weapons[e.weapon] : undefined;
        this.shieldHitAt[e.ship] = this.time;
        this.ripple(e.ship, e.px, e.py);
        play(this.db, bp?.sounds?.shield?.length ? bp.sounds.shield : ["hitShield1", "hitShield2", "hitShield3"]);
        break;
      }
      case "miss": {
        const bp = e.weapon ? this.db.weapons[e.weapon] : undefined;
        this.missFly(e.ship, e.px, e.py);
        this.floatText(e.ship, e.px, e.py, "MISS", 0xdddddd);
        play(this.db, bp?.sounds?.miss?.length ? bp.sounds.miss : ["miss"]);
        break;
      }
      case "beam":
        // The beam itself is drawn as it sweeps (drawBeam); a beam stopped by shields flashes them.
        if (e.blocked) {
          this.shieldHitAt[e.ship] = this.time;
          this.ripple(e.ship, e.x1, e.y1);
        }
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
        this.hackLandAt.set(e.ship, this.time);
        play(this.db, ["hackLand"], e.ship === v.you ? 0.8 : 1);
        if (e.ship !== v.you) this.say("Hacking drone attached!", 0xd070ff);
        break;
      case "hackPulse":
        play(this.db, ["hackStart"], 1);
        break;
      case "hazard":
        if (e.kind === "warn") {
          play(this.db, ["environWarning"], 1.2);
          this.say(v.hazard?.kind === "pulsar" ? `Ion pulse in ${e.in} s` : `Solar flare in ${e.in} s`, 0xffc070);
        } else if (e.kind === "asb") {
          play(this.db, ["warning"], 1.2);
          this.say(e.ship === v.you ? "Anti-ship batteries locked on to you!" : "Anti-ship batteries locked on to the enemy", 0xff8060);
        } else if (e.kind === "flare" && e.ship === v.you) {
          this.flashAt = this.time;
          this.flashColor = 0xffd8a0;
          play(this.db, ["solarFlare"], 1);
        } else if (e.kind === "pulse" && e.ship === v.you) {
          this.flashAt = this.time;
          this.flashColor = 0x80b0ff;
          play(this.db, ["pulsar"], 1);
        }
        break;
      case "pauseWarn":
        // FTL's flagship power-surge warning: something big is coming.
        play(this.db, ["surgeWarning"], 1);
        this.say(`Tactical timeout in ${e.in} s`, 0x9fd8ff);
        break;
      case "pause":
        // Time stopping: a cloak's whoosh as the music winds down to a slow, low drone; the decloak as it
        // spins back up.
        timeStop(e.on);
        play(this.db, [e.on ? "cloak" : "decloak"], 1);
        if (e.on) stopLoops();
        if (!e.on) this.say(e.kind === "tactical" ? "Timeout over" : "Resumed", 0x9fd8ff);
        break;
      case "doorBroken":
        play(this.db, ["doorOpen"], 1);
        break;
      case "droneLost":
        if (e.ship === v.you) this.say("Drone destroyed", 0xff8a70);
        break;
      case "death": {
        const c = v.ships.flatMap((s) => s.crew).find((q) => q.id === e.crew);
        play(this.db, this.deathSound(c?.race ?? "human", c?.name ?? ""), e.ship === v.you ? 1 : 0.5);
        break;
      }
      case "clone":
        play(this.db, ["cloneArrive"], e.ship === v.you ? 1 : 0.5);
        break;
      case "end": {
        const loser = e.winner === -1 ? -1 : 1 - e.winner;
        const destroyed = /destroyed/.test(e.reason) ? (loser === -1 ? [0, 1] : [loser]) : [];
        // Every hull blows apart the same way, the Rebel flagship's stages included (each has its own gibs).
        for (const i of destroyed) this.explode(i);
        // (frame() calls onEndReady when the battle clock gets there: a timer could fire while slow frames
        // still have the clock short, and the end screen would never come.)
        this.endReadyAt = this.time + (destroyed.length ? 4.2 + EXPLODE_PRE : 1.2);
        break;
      }
      default:
        break;
    }
  }

  /** FTL's death cry for each race (humans by the name's sex); drones just blow up. */
  private deathSound(race: string, name: string): string[] {
    const own: Record<string, string[]> = {
      engi: ["engiDeath"], mantis: ["mantisDeath"], rock: ["rockDeath"], crystal: ["crystalDeath"], energy: ["energyDeath"],
      anaerobic: ["shrikeDeath"], battle: ["smallExplosion"], repair: ["smallExplosion"], boarder: ["smallExplosion"], boarder_ion: ["smallExplosion"],
    };
    if (own[race]) return own[race];
    if (race === "human" && this.db.femaleNames?.includes(name)) return ["femaleDeath1", "femaleDeath2", "femaleDeath3"];
    return ["death1", "death2"];
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

  /**
   * A ship's death as in FTL: blasts ripple across the still-whole hull for EXPLODE_PRE seconds, then a last
   * big one and it breaks apart (the gibs; `explodedAt` is when the break-up starts).
   */
  private explode(ship: number): void {
    this.explodedAt.set(ship, this.time + EXPLODE_PRE);
    const b = this.rOf(ship).bounds();
    const n = 9;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (!this.view) return;
        this.boom(ship, b.x + b.w * (0.15 + 0.7 * hash01(i * 3 + ship)), b.y + b.h * (0.2 + 0.6 * hash01(i * 7 + ship)), 1.2 + hash01(i) * 1.0);
        if (i % 3 === 0) play(this.db, ["explosion1", "explosion2", "explosion3", "explosion4"]);
      }, (i * EXPLODE_PRE * 1000) / n);
    }
    setTimeout(() => {
      if (!this.view) return;
      this.boom(ship, b.x + b.w / 2, b.y + b.h / 2, 3.2);
      play(this.db, ["explosion1", "explosion2", "explosion3", "explosion4"]);
    }, EXPLODE_PRE * 1000);
  }

  // ---------------------------------------------------------------- frame

  /** Share of the way to the next snapshot, and this frame's length (drone motion is smoothed with them). */
  private snapK = 0;
  private frameDt = 0;

  private endFired = false;

  frame(dt: number): void {
    this.time += dt;
    if (!this.endFired && this.endReady()) {
      this.endFired = true;
      this.onEndReady();
    }
    this.frameDt = dt;
    const v = this.view;
    if (!v) return;
    if (!v.pause) this.animTime += dt;
    for (const [i, s] of this.drift.entries()) if (!v.pause) s.x = ((s.x + dt * (6 + i * 4) + 300) % (W + 600)) - 300;
    const fk = (this.time - this.flashAt) / 0.9;
    this.flash.tint = this.flashColor;
    this.flash.alpha = fk >= 0 && fk < 1 ? 0.55 * (1 - fk) : 0;
    this.pauseTint.alpha += ((v.pause ? 0.28 : 0) - this.pauseTint.alpha) * Math.min(1, dt * 6);
    for (const m of [this.flashTiles, this.flashTilesEnemy]) for (const [k, left] of m) left - dt <= 0 ? m.delete(k) : m.set(k, left - dt);
    const k = Math.min(1, (performance.now() - this.snapAt) / (1000 / SNAP_HZ));
    this.snapK = k;
    const ownV = v.ships[v.you];
    const enV = v.ships[1 - v.you];
    // Broken up only once the blasts have had their moment (see explode()).
    const ex = (i: number) => (this.explodedAt.has(i) && this.time >= this.explodedAt.get(i)! ? this.time - this.explodedAt.get(i)! : null);
    const eng = (s: ShipView) => {
      const e = s.systems.engines;
      return e ? Math.max(0, Math.min(e.power + (e.bonus ?? 0), usable(e))) : 0;
    };
    this.own.update(ownV, this.crewDraw(ownV, this.prev?.ships[v.you], k, true), this.animTime, {
      hover: this.hoverOwn, weaponFrame: (s) => this.weaponFrameFor(ownV, v.you, s), shieldFlash: this.time - this.shieldHitAt[v.you],
      exploded: ex(v.you), destinations: true, flashTiles: this.flashTiles, engines: this.jumpAt !== null || this.arriveAt !== null ? 8 : eng(ownV), cloaked: (ownV.cloak?.t ?? 0) > 0, clock: this.time,
    });
    this.enemy.update(enV, this.crewDraw(enV, this.prev?.ships[1 - v.you], k, false), this.animTime, {
      hover: this.armed !== null ? this.hoverEnemy : { room: -1, door: -1 }, weaponFrame: (s) => this.weaponFrameFor(enV, (1 - v.you) as 0 | 1, s),
      shieldFlash: this.time - this.shieldHitAt[1 - v.you], exploded: ex(1 - v.you), engines: enV.thrust ?? (enV.systemsKnown ? eng(enV) : 1), cloaked: (enV.cloak?.t ?? 0) > 0,
      destinations: true, flashTiles: this.flashTilesEnemy, clock: this.time,
    });
    this.crewSounds(v);
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
        offline: c.drone !== undefined && !this.view!.ships[c.owner].drones?.[c.drone]?.powered,
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
    // Aiming a beam: after the first click its line follows the mouse, as long as the beam (no point markers).
    if (this.beamStart && this.armed !== null) {
      const L = this.db.weapons[own.weapons[this.armed]?.bp]?.length || 60;
      const m = this.enemy.root.toLocal(this.stage.toGlobal(this.mouse));
      const dx = m.x - this.beamStart.x;
      const dy = m.y - this.beamStart.y;
      const d = Math.hypot(dx, dy) || 1;
      g.moveTo(this.beamStart.x, this.beamStart.y).lineTo(this.beamStart.x + (dx / d) * L, this.beamStart.y + (dy / d) * L).stroke({ color: 0xffd040, width: 3, alpha: 0.85 });
    }
    mk.end();
    this.own.overlay.clear();
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
      if (p.kind === "BEAM") {
        this.drawBeam(v, p, dtSnap);
        continue;
      }
      if (p.hazard) {
        this.drawHazardShot(v, p, dtSnap);
        continue;
      }
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
      // Flak pieces fly FTL's debris art, a different piece per shot of the volley.
      const art = bp?.pieceArt?.length ? bp.pieceArt[p.id % bp.pieceArt.length] : bp?.image;
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
      if (p.kind === "HACK" && p.target.kind === "room") {
        const spot = this.hackSpot(dst, p.target.room);
        if (spot) [tx, ty] = [spot.x, spot.y];
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
        // Weapons leave their mount's barrel; the flagship's artillery its own guns; anything else the ship's middle.
        const local = p.slot >= 0 ? src.muzzlePoint(p.slot, slotBp) : p.slot <= -2 ? src.artilleryMuzzle(-2 - p.slot) : src.gridCentre();
        const rotated = p.slot >= 0 ? (src.layout.mounts[p.slot]?.rotate ?? true) : p.slot <= -2 ? false : mine;
        const muzzle = this.stage.toLocal(src.root.toGlobal(local));
        const ahead = this.stage.toLocal(src.root.toGlobal({ x: local.x + (rotated ? 10 : 0), y: local.y - (rotated ? 0 : 10) }));
        const d = Math.hypot(ahead.x - muzzle.x, ahead.y - muzzle.y) || 1;
        const dx = (ahead.x - muzzle.x) / d;
        const dy = (ahead.y - muzzle.y) / d;
        const dist = speed * t;
        this.drawShot(mine ? this.projOwn : this.projWin, art, muzzle.x + dx * dist, muzzle.y + dy * dist, Math.atan2(dy, dx), p.kind, 1);
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
        this.drawShot(mine ? this.projWin : this.projOwn, art, x, y, heading, p.kind, 1);
      }
    }
  }

  /**
   * A beam as FTL draws it: a continuous beam of the weapon's colour from beyond the edge of the target view,
   * its tip sweeping along the aimed line while it fires, with FTL's contact flare where it touches. Shields it
   * can't get through stop it at the bubble. On the firing ship, the beam leaves the gun and runs off screen.
   */
  private drawBeam(v: MatchView, p: MatchView["projectiles"][number], dtSnap: number): void {
    if (p.target.kind !== "beam" || p.delay > 0) return;
    const bp = this.db.weapons[p.weapon];
    const mine = p.from === v.you;
    const src = mine ? this.own : this.enemy;
    const dst = mine ? this.enemy : this.own;
    const T = v.ships[1 - p.from];
    const k = Math.max(0, Math.min(1, (p.t + dtSnap) / (p.flight || 1)));
    const t = p.target;
    const L = bp?.length || 60;
    const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1) || 1;
    const tip = this.stage.toLocal(dst.root.toGlobal({ x: t.x1 + ((t.x2 - t.x1) / len) * L * k, y: t.y1 + ((t.y2 - t.y1) / len) * L * k }));
    const spread = (hash01(p.id) - 0.5) * 0.9;
    const ang = (mine ? Math.PI : 0) + spread;
    const from = { x: tip.x + Math.cos(ang) * 700, y: tip.y + Math.sin(ang) * 700 - 120 };
    // Stopped by shields (more layers than the beam's damage, less its piercing): end at the bubble.
    const blocked = (T.superShield ?? 0) > 0 || (bp ? bp.damage - Math.max(0, T.shieldLayers - (bp.sp ?? 0)) <= 0 : false);
    let end: { x: number; y: number } = tip;
    if (blocked) {
      // Walk in from the edge until the beam meets the bubble (tested in the target ship's own coordinates).
      const e = dst.shieldEllipse();
      for (let i = 0; i <= 60; i++) {
        const q = { x: from.x + (tip.x - from.x) * (i / 60), y: from.y + (tip.y - from.y) * (i / 60) };
        const l = dst.root.toLocal(this.stage.toGlobal(q));
        if (((l.x - e.x) / e.a) ** 2 + ((l.y - e.y) / e.b) ** 2 < 1) {
          end = q;
          break;
        }
      }
    }
    const [r0, g0, b0] = bp?.color ?? [255, 40, 30];
    const col = (r0 << 16) | (g0 << 8) | b0;
    const flicker = 0.85 + 0.15 * Math.sin(this.time * 40 + p.id);
    const layer = mine ? this.projWin : this.projOwn;
    const g = new Graphics();
    g.moveTo(from.x, from.y).lineTo(end.x, end.y).stroke({ color: col, width: 9 * flicker, alpha: 0.45 });
    g.moveTo(from.x, from.y).lineTo(end.x, end.y).stroke({ color: col, width: 5, alpha: 0.9 });
    g.moveTo(from.x, from.y).lineTo(end.x, end.y).stroke({ color: 0xffffff, width: 1.6, alpha: 0.9 });
    layer.addChild(g);
    const flare = animFrame(this.db, "beam_contact", 0);
    if (flare) {
      const s = new Sprite(flare);
      s.anchor.set(0.5);
      s.position.set(end.x, end.y);
      s.scale.set(0.7 + 0.2 * flicker);
      s.rotation = this.time * 3;
      s.tint = blocked ? 0x9fd8ff : 0xffffff;
      layer.addChild(s);
    }
    // On the firing ship: out of the barrel and off screen.
    if (p.slot >= 0 || p.slot <= -2) {
      const local = p.slot >= 0 ? src.muzzlePoint(p.slot, v.ships[p.from].weapons[p.slot]?.bp ?? p.weapon) : src.artilleryMuzzle(-2 - p.slot);
      const rotated = p.slot >= 0 ? (src.layout.mounts[p.slot]?.rotate ?? true) : false;
      const m0 = this.stage.toLocal(src.root.toGlobal(local));
      const m1 = this.stage.toLocal(src.root.toGlobal({ x: local.x + (rotated ? 10 : 0), y: local.y - (rotated ? 0 : 10) }));
      const d = Math.hypot(m1.x - m0.x, m1.y - m0.y) || 1;
      const out = { x: m0.x + ((m1.x - m0.x) / d) * 1400, y: m0.y + ((m1.y - m0.y) / d) * 1400 };
      const g2 = new Graphics();
      g2.moveTo(m0.x, m0.y).lineTo(out.x, out.y).stroke({ color: col, width: 7 * flicker, alpha: 0.45 }).moveTo(m0.x, m0.y).lineTo(out.x, out.y).stroke({ color: 0xffffff, width: 1.6, alpha: 0.9 });
      (mine ? this.projOwn : this.projWin).addChild(g2);
    }
    // The impact sizzle while it touches (FTL's beam sound is the launch; this is its hit on hull or shield).
    if (!this.beamSounded.has(p.id)) {
      this.beamSounded.add(p.id);
      play(this.db, blocked ? ["hitShield1", "hitShield2", "hitShield3"] : bp?.sounds?.hit?.length ? bp.sounds.hit : ["hitHull1", "hitHull2"], mine ? 0.8 : 0.6);
    }
  }

  /** An asteroid tumbling in (FTL's asteroid art), or an ASB shell streaking down, from beyond the target view. */
  private drawHazardShot(v: MatchView, p: MatchView["projectiles"][number], dtSnap: number): void {
    const target = 1 - p.from;
    const r = target === v.you ? this.own : this.enemy;
    const k = Math.min(1, (p.t + dtSnap) / (p.flight || 1));
    const to = this.stage.toLocal(r.root.toGlobal({ x: p.px, y: p.py }));
    const ang = hash01(p.id) * Math.PI * 2;
    const R = 650 * (1 - k);
    const x = to.x + Math.cos(ang) * R;
    const y = to.y + Math.sin(ang) * R;
    const layer = target === v.you ? this.projOwn : this.projWin;
    if (p.weapon === "__ASTEROID") {
      const t = texNow(`asteroids/asteroid${p.id % 10}.png`);
      if (t) {
        const s = new Sprite(t);
        s.anchor.set(0.5);
        s.position.set(x, y);
        s.rotation = this.animTime * 3 + p.id;
        layer.addChild(s);
      } else layer.addChild(new Graphics().circle(x, y, 7).fill({ color: 0x8a7a6a }));
      return;
    }
    if (!this.launched.has(p.id)) {
      this.launched.add(p.id);
      play(this.db, ["fleetFireHeavy"], 0.9);
    }
    const g = new Graphics();
    const dx = Math.cos(ang) * 26;
    const dy = Math.sin(ang) * 26;
    g.moveTo(x + dx, y + dy).lineTo(x, y).stroke({ color: 0xff7030, width: 9, alpha: 0.5 }).moveTo(x + dx, y + dy).lineTo(x, y).stroke({ color: 0xfff0c0, width: 3 });
    layer.addChild(g);
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
      // Flak debris tumbles as it flies.
      s.rotation = kind === "MISSILES" ? ang + Math.PI / 2 : kind === "BOMB" ? 0 : kind === "BURST" ? this.animTime * 6 + x * 0.01 : ang;
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
      const mx = this.lay.sysX[id];
      const at = mx !== undefined ? { x: mx + 32, y: SYS_ICON_Y + 32 } : SUB_SYS.includes(id) ? { x: SUB_X0 + (SUB_OFF[id] ?? 0) + 32, y: SUB_ICON_Y + 32 } : null;
      if (!at) continue;
      if (sys.ion > 0) this.ionPie(`ion${id}`, sys, at.x, at.y);
      else this.lockPie(`lock${id}`, this.lockLeft(own, id), at.x, at.y);
    }
    if (this.message && this.time < this.message.until) {
      const t = h.text("msg", this.message.text, 440, 588, fstyle("JustinFont12Bold", this.message.color, { stroke: 0x101010, strokeWidth: 3 }), [0.5, 0]);
      t.alpha = Math.min(1, (this.message.until - this.time) / 0.4);
    }
    this.pauseHud(v);
    this.hazardHud(v);
    this.survivalHud();
    this.jumpFrame();
    this.tooltip(v);
    // The selection box, in screen space above everything (both ships and the hostiles window).
    if (this.drag) {
      const d = this.drag;
      h.gfx("drag").rect(Math.min(d.x, d.x2), Math.min(d.y, d.y2), Math.abs(d.x2 - d.x), Math.abs(d.y2 - d.y)).fill({ color: 0x30ff30, alpha: 0.08 }).stroke({ color: 0x30ff30, width: 1.5 });
    }
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

  /** The hazard's name and, for timed ones, the seconds to the next strike (under the pause clock). */
  private hazardHud(v: MatchView): void {
    const hz = v.hazard;
    if (!hz || hz.kind === "none") return;
    const name = { sun: "RED GIANT: solar flares", pulsar: "PULSAR: ion pulses", asteroids: "ASTEROID FIELD", nebula: "NEBULA: sensors down", storm: "ION STORM: reactors at half, sensors down", asb: "ANTI-SHIP BATTERIES", none: "" }[hz.kind];
    const timed = hz.kind === "sun" || hz.kind === "pulsar" || hz.kind === "asb";
    const soon = timed && hz.next <= 5;
    const txt = timed ? `${name}  ·  ${Math.ceil(hz.next)} s` : name;
    this.hud.text("hzT", txt, 640, 44, fstyle("JustinFont10", soon ? 0xff9060 : 0xd8c8a8, { stroke: 0x101010 }), [0.5, 0]);
  }

  private pauseBox: Box | null = null;

  /** Survival: the run and the lobby phase (main.ts sets them on every lobby update). */
  survival: { s: SurvivalState; phase: string; at: number } | null = null;

  /**
   * Survival's HUD: the run on one line at the top; after a win, FTL's jump button charging over the
   * aftermath (the crew's time to patch the ship up), reading JUMP once it's full.
   */
  private survivalHud(): void {
    const sv = this.survival;
    if (!sv) return;
    const h = this.hud;
    const s = sv.s;
    const line = `SURVIVAL  ·  BATTLE ${s.battle}  ·  SCORE ${s.score}${s.boss ? "  ·  BOSS" : ""}`;
    h.text("svL", line, 640, 8, fstyle("JustinFont10", s.boss ? 0xff9a80 : 0xd8e8d0, { stroke: 0x101010 }), [0.5, 0]);
    if (sv.phase !== "aftermath" && sv.phase !== "reward" && sv.phase !== "jump") return;
    // The aftermath clock ticks once a second from the server; smooth it between updates.
    const left = sv.phase === "aftermath" ? Math.max(0, s.aftermathLeft - (performance.now() - sv.at) / 1000) : 0;
    const k = 1 - left / SURVIVAL.aftermath;
    const x = 640 - 49;
    const y = 54;
    const base = texNow("buttons/FTL/FTL_base.png");
    const full = k >= 1;
    if (base) h.sprite("svB", base, x, y, { tint: full && Math.floor(this.time * 3) % 2 ? 0xc8ffc8 : 0xffffff });
    else h.gfx("svB").roundRect(x, y, 98, 55, 8).fill({ color: 0x4a6470 }).stroke({ color: 0xcfe8e8, width: 2 });
    const bars = texNow("buttons/FTL/FTL_loadingbars.png");
    const off = texNow("buttons/FTL/FTL_loadingbars_off.png");
    if (off) h.sprite("svO", off, x + 12, y + 20);
    if (bars && k > 0) h.sprite("svF", frame(bars, 0, 0, Math.max(1, Math.round(74 * k)), 29), x + 12, y + 20);
    h.text("svT", full ? "JUMP" : "FTL", 640, y + 4, fstyle("JustinFont12Bold", full ? 0x9cff9c : 0xe8ece8, { stroke: 0x101010 }), [0.5, 0]);
    const msg = sv.phase === "aftermath" ? `Enemy destroyed  ·  repairs before the jump: ${Math.ceil(left)} s` : sv.phase === "reward" ? "Choose a reward" : "Jumping…";
    h.text("svM", msg, 640, y + 60, fstyle("JustinFont10", 0xdfe8ff, { stroke: 0x101010 }), [0.5, 0]);
  }

  /** This battle's beacon (Survival): backdrop, maybe a planet and where it sits (0..1 of the screen). */
  backdrop: { bg: string; planet?: string; px: number; py: number } | null = null;

  /** When the player's ship came out of the jump (it slides in from the left, braking). */
  private arriveAt: number | null = null;
  arriveIn(): void {
    this.arriveAt = this.time;
  }

  /** When the player's ship started its FTL jump (Survival, after the reward pick). */
  private jumpAt: number | null = null;
  private jumpBase: { x: number; sx: number } | null = null;

  /**
   * The FTL jump, as FTL does it: the drive spools up (engines flare), the ship creeps forward, then shoots
   * off to the right, stretching into a streak. main.ts follows with the white flash and the fade to black.
   */
  jumpOut(): void {
    if (this.jumpAt !== null) return;
    this.jumpAt = this.time;
    play(this.db, ["jumpLeave"], 1);
  }

  private jumpFrame(): void {
    if (!this.own) return;
    if (this.arriveAt !== null && this.jumpAt === null) {
      // Out of the jump: in from the left, fast, braking hard into place (stretched while it's quick).
      const r = this.own.root;
      this.jumpBase ??= { x: r.position.x, sx: r.scale.x };
      const k = Math.min(1, (this.time - this.arriveAt) / 1.1);
      const e = (1 - k) ** 3;
      r.position.x = this.jumpBase.x - 1400 * e;
      r.scale.x = this.jumpBase.sx * (1 + 2.5 * e);
      if (k >= 1) {
        r.position.x = this.jumpBase.x;
        r.scale.x = this.jumpBase.sx;
        this.arriveAt = null;
        this.jumpBase = null;
      }
      return;
    }
    if (this.jumpAt === null) return;
    const r = this.own.root;
    this.jumpBase ??= { x: r.position.x, sx: r.scale.x };
    const t = this.time - this.jumpAt;
    // 0-0.9 s: a slow creep while the drive spools; then away, faster and faster.
    const creep = Math.min(t, 0.9) * 18;
    const go = Math.max(0, t - 0.9);
    const dx = creep + 2400 * go * go;
    r.position.x = this.jumpBase.x + dx;
    r.scale.x = this.jumpBase.sx * (1 + Math.min(3, go * 4));
    r.alpha = Math.max(0, 1 - go * 1.4);
  }

  /**
   * Pausing (experimental): FTL's blinking PAUSED banner while time is stopped, with who stopped it and the
   * seconds left; the pause clocks (yours and theirs) or the time to the next tactical timeout at the top.
   */
  private pauseHud(v: MatchView): void {
    const h = this.hud;
    const mode = v.config.pause ?? "off";
    this.pauseBox = null;
    if (mode === "off") return;
    const fmt = (t: number) => (t < 0 ? "∞" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);
    const st = fstyle("JustinFont10", 0xdfe8ff, { stroke: 0x101010 });
    const p = v.pause;
    if (p) {
      const t = texNow(Math.floor(this.time * 2) % 2 ? "Text_pause1.png" : "Text_pause2.png");
      if (t) h.sprite("pzT", t, 640, 84, { anchor: 0.5 });
      else h.text("pzT", "PAUSED", 640, 84, fstyle("HL2", 0xe8ece8, { scale: 3, stroke: 0x101010, strokeWidth: 3 }), [0.5, 0.5]);
      const who = p.kind === "tactical" ? "TACTICAL TIMEOUT" : p.by === v.you ? "You paused" : `${v.ships[p.by ?? 0].player} paused`;
      const hint = p.kind === "tactical" ? (p.ready?.[v.you] ? "Ready: waiting for the other captain" : "Space when you're ready") : p.by === v.you ? "Space to resume" : "Orders still go in";
      h.text("pzW", p.left < 0 ? `${who}  ·  ${hint}` : `${who}  ·  ${fmt(p.left)}  ·  ${hint}`, 640, 112, st, [0.5, 0]);
    }
    if (mode === "tactical" && !p && v.nextTactical !== undefined) {
      h.text("pzN", `Tactical timeout in ${fmt((v.nextTactical - v.tick) / 30)}`, 640, 28, st, [0.5, 0]);
    }
    if (mode === "clock" && v.pauseBank) {
      const mine = v.pauseBank[v.you];
      const theirs = v.pauseBank[1 - v.you];
      // Practice's unlimited clock is FTL's own pause: no clocks to show.
      const label = mine < 0 ? "Pause: Space" : `Pause (Space): you ${fmt(mine)}  ·  them ${fmt(theirs)}`;
      const tt = h.text("pzC", label, 640, 28, fstyle("JustinFont10", mine === 0 ? 0xff8070 : 0xdfe8ff, { stroke: 0x101010 }), [0.5, 0]);
      this.pauseBox = { x: 640 - tt.width / 2, y: 26, w: tt.width, h: 18 };
    }
  }

  /** Space: pause from your clock, resume your own pause, or say you're ready in a tactical timeout. */
  private togglePause(): void {
    const v = this.view;
    if (!v || v.winner !== null) return;
    const mode = v.config.pause ?? "off";
    const p = v.pause;
    if (p?.kind === "tactical") return this.send({ c: "pause", on: false });
    if (mode !== "clock") return this.fail(mode === "tactical" ? "Pausing comes in tactical timeouts" : "Pausing is off for this match");
    if (p) {
      if (p.by !== v.you) return this.fail("The other captain paused: it's their clock running");
      return this.send({ c: "pause", on: false });
    }
    if (v.pauseBank?.[v.you] === 0) return this.fail("Your pause clock is empty");
    this.send({ c: "pause", on: true });
  }

  private shotPhase = new Map<number, number>();

  /**
   * Crew small arms (FTL's crewLaser sounds) each time a shot leaves a gun, whether at a foe, a door or a
   * system, for everyone we can see; FTL's brawling loop while anyone punches. The enemy ship is quieter.
   */
  private crewSounds(v: MatchView): void {
    if (v.pause || v.winner !== null) return;
    let punching = false;
    for (const s of v.ships) {
      const r = s.idx === v.you ? this.own : this.enemy;
      for (const c of s.crew) {
        if (c.task === "fight" && c.punch && !c.dead) punching = true;
        const ph = attackPhase(c, this.animTime);
        const was = this.shotPhase.get(c.id);
        if (ph === null) {
          this.shotPhase.delete(c.id);
          continue;
        }
        this.shotPhase.set(c.id, ph);
        if (was === undefined) continue;
        const crossed = (was < SHOT_AT && ph >= SHOT_AT) || (ph < was && ph >= SHOT_AT);
        const room = r.geo.tiles.get(c.tile)?.room ?? -1;
        const seen = !s.visibleRooms || s.visibleRooms.includes(room);
        if (crossed && seen) play(this.db, ["crewLaser1", "crewLaser2", "crewLaser3"], s.idx === v.you ? 0.9 : 0.5);
      }
    }
    loop(this.db, "brawling", punching, 0.8);
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
  private hammerAt = -9;
  private lastCountdown = 0;
  private soundscape(v: MatchView): void {
    const own = v.ships[v.you];
    const g = this.own.geo;
    // Our own crew aboard our ship (intruders make none of these sounds for us).
    const alive = own.crew.filter((c) => !c.dead && c.dying === undefined && c.owner === v.you);
    const roomOf = (c: { tile: string }) => g.tiles.get(c.tile)?.room;
    // While time is stopped the world falls silent but for a low hum (nothing burns, leaks or gets fixed).
    const over = v.winner !== null || !!v.pause;
    loop(this.db, "nebula", !!v.pause && v.winner === null, 0.35);
    // The last seconds before a tactical timeout tick down.
    if (v.nextTactical !== undefined && !v.pause) {
      const left = Math.ceil((v.nextTactical - v.tick) / 30);
      if (left !== this.lastCountdown && left >= 1 && left <= 3) play(this.db, ["hoverBeep"], 1.4);
      this.lastCountdown = left;
    }
    loop(this.db, "fire", !over && own.rooms.some((r) => Object.keys(r.fires).length > 0), 0.8);
    const venting = g.doors.some((d, i) => own.doors[i] && (d.roomA < 0 || d.roomB < 0));
    loop(this.db, "airLeak", !over && (venting || own.rooms.some((r) => Object.keys(r.breaches).length > 0)), 1);
    // Repair sounds by race: Rockmen and Crystals hammer, a Lanius has its own, everyone else FTL's welder.
    const fixing = alive.filter((c) => c.task === "repair" || c.task === "breach");
    loop(this.db, "repair", !over && fixing.some((c) => !["rock", "crystal", "anaerobic"].includes(c.race)), 0.8);
    loop(this.db, "shrikeRepair", !over && fixing.some((c) => c.race === "anaerobic"), 0.8);
    if (!over && fixing.some((c) => c.race === "rock" || c.race === "crystal") && this.time - this.hammerAt > 0.55) {
      this.hammerAt = this.time;
      play(this.db, ["rockThud1", "rockThud2", "rockThud3"], 0.9);
    }
    // A weapon coming ready chimes (FTL's weaponReady), unless it's on autofire and will just fire.
    const prevW = this.prev?.ships[v.you].weapons;
    if (prevW && !over) own.weapons.forEach((w, i) => {
      const was = prevW[i];
      if (was && was.bp === w.bp && was.volleys === 0 && w.volleys > 0 && !w.autofire) play(this.db, ["weaponReady"], 0.8);
    });
    // A switched-off clone bay with someone in its queue groans (FTL's cloneBroken loop).
    const cbs = own.systems.clonebay;
    const queued = own.crew.some((c) => c.dead && c.clone !== undefined);
    loop(this.db, "cloneBroken", !over && !!cbs && queued && (cbs.power + (cbs.bonus ?? 0) <= 0 || cbs.damage >= cbs.level || !!cbs.hacked) && !(own.augments ?? []).includes("BACKUP_DNA"), 0.7);
    loop(this.db, "extinguish", !over && alive.some((c) => c.task === "fire"), 0.8);
    loop(this.db, "healing", !over && alive.some((c) => c.healing && c.hp < c.maxHp), 0.7);
    // Low-health beep for our own crew wherever they are (never for enemies, even aboard our ship): once per
    // threshold crossed (50 %, then the red-box level), re-armed when healed past it.
    for (const c of this.myCrew(v).filter((q) => !q.dead && q.dying === undefined && q.owner === v.you)) {
      const k = c.hp / c.maxHp;
      const level = k < LOW_HP ? 2 : k < 0.5 ? 1 : 0;
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
    // Zoltan shield (augment, Shield Overcharger): FTL's energy-shield box under the layers, one green bar a point.
    this.superBar("zs", s.superShield ?? 0, 26, 86, "statusUI/energy_shield_box.png");
    // The blue bar only shows while a layer is recharging.
    if (s.shieldLayers < max && s.shieldCharge > 0) g.rect(32, 78, Math.floor((90 * s.shieldCharge) / 3) * 3, 6).fill({ color: 0x2a7bff });
    // Missiles (FTL's fuel slot is unused in the arena, so missiles take its place).
    const mt = texNow(s.missiles > 0 ? "statusUI/top_missiles_on.png" : "statusUI/top_missiles_on_red.png");
    if (mt) h.sprite("msl", mt, 122, 43);
    h.text("mslT", String(s.missiles), 174, 45, fstyle("num_font", s.missiles > 0 ? 0xffffff : 0xff6050), [0.5, 0]);
    // Drone parts, right beside the missiles (no fuel in the arena, so everything shifts one box left).
    if (s.systems.drones || (s.drones ?? []).length) {
      const dt = texNow("statusUI/top_drones_on.png");
      if (dt) h.sprite("drn", dt, 190, 43);
      h.text("drnT", String(s.droneParts ?? 0), 242, 45, fstyle("num_font", (s.droneParts ?? 0) > 0 ? 0xffffff : 0xff6050), [0.5, 0]);
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

  /** A Zoltan shield's points as FTL's green energy bars in their box (only while there are any). */
  private superBar(key: string, n: number, x: number, y: number, box: string, step = 19, w = 17): void {
    if (n <= 0) return;
    const h = this.hud;
    const b = texNow(box);
    if (b) h.sprite(`${key}B`, b, x, y);
    const bar = texNow("statusUI/energy_shield_bar.png");
    for (let i = 0; i < Math.min(12, n); i++) {
      if (bar) h.sprite(`${key}${i}`, bar, x + 3 + i * step, y + 3, { w, h: 6 });
      else h.gfx(`${key}g${i}`).rect(x + 3 + i * step, y + 3, w, 6).fill({ color: 0x78ff50 });
    }
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
    // A hacking drone on their shields shows the next layer charging, like our own bar.
    const layersShown = Math.max(max, en.shieldLayers);
    if (en.shieldChargeKnown && en.shieldLayers < max && en.shieldCharge > 0) {
      g.rect(x + 22, y + 96, layersShown * 24 - 6, 4).fill({ color: 0x101820 });
      g.rect(x + 22, y + 96, Math.floor((layersShown * 24 - 6) * Math.min(1, en.shieldCharge)), 4).fill({ color: 0x2a7bff });
    }
    this.superBar("ezs", en.superShield ?? 0, x + 20, y + 99, (en.superShield ?? 0) > 5 ? "combatUI/box_hostiles_shield_super12.png" : "combatUI/box_hostiles_shield_super5.png", 10, 9);
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
      const state = s.damage >= s.level ? "red" : s.ion > 0 ? "blue" : s.damage > 0 ? "orange" : en.systemsKnown && s.power === 0 && !SUBSYSTEMS.includes(id) ? "grey" : "green";
      const t = texNow(`icons/s_${baseSystemId(id)}_${state}1.png`);
      if (t) h.sprite(`eic${id}`, t, x + 74 + i * step, y + 502, { anchor: 0.5, scale: 0.85 * Math.min(1, step / 30 + 0.15), tint: s.hacked ? 0xd070ff : 0xffffff });
      if (s.locked) h.sprite(`eick${id}`, texNow("icons/s_hacked.png"), x + 82 + i * step, y + 494, { anchor: 0.5, scale: 0.6 });
      // Level 4 sensors (manned level 3): each system's bars above its icon, powered, ionised, damaged and
      // being repaired, as FTL shows them.
      if (en.systemsKnown) {
        const bx = x + 74 + i * step - 5;
        const g2 = h.gfx(`ebars${id}`);
        const cap = usable(s);
        for (let b = 0; b < Math.min(s.level, 8); b++) {
          const yy = y + 482 - b * 5;
          const dmg = b >= s.level - s.damage;
          const ion = !dmg && b >= cap;
          const on = !dmg && !ion && (SUBSYSTEMS.includes(id) ? b < cap : b < Math.min(cap, s.power + (s.bonus ?? 0)));
          const sab = !dmg && b === s.level - s.damage - 1 && (s.sabotage ?? 0) > 0;
          const col = dmg ? (b === s.level - s.damage && s.repair > 0 ? 0xffe050 : 0xff3a2a) : sab ? 0xff8040 : ion ? 0x3a7fd0 : on ? 0x78ff78 : 0x40484a;
          g2.rect(bx, yy, 10, 3).fill({ color: col });
        }
      }
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
      // The dead (cloning ones too: their progress shows in the clone bay's queue above its bars) drop out.
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
    this.crewListBottom = y + 50;
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
  /** Where the crew list (and its station buttons) ends: the reactor column fits below it. */
  private crewListBottom = 0;
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
      else if (b === sys.level - sys.damage - 1 && (sys.sabotage ?? 0) > 0) {
        // Boarders at work: the next bar to break fills red as they wreck it.
        if (powered) g.rect(x, yy, BAR_W, BAR_H).fill({ color: 0x78ff78 });
        else g.rect(x + 0.5, yy + 0.5, BAR_W - 1, BAR_H - 1).stroke({ color: 0xe8ece8, width: 1 });
        g.rect(x, yy, Math.max(3, Math.floor((BAR_W * (sys.sabotage ?? 0)) / 3) * 3), BAR_H).fill({ color: 0xff3a2a });
      } else if (powered) g.rect(x, yy, BAR_W, BAR_H).fill({ color: !isSub && b >= sys.power ? 0xd8ff50 : 0x78ff78 });
      else g.rect(x + 0.5, yy + 0.5, BAR_W - 1, BAR_H - 1).stroke({ color: 0xe8ece8, width: 1 });
    }
  }

  private iconState(sys: NonNullable<ShipView["systems"][SystemId]>): string {
    if (sys.damage >= sys.level) return "red";
    if (sys.ion > 0) return "blue";
    if (sys.damage > 0) return "orange";
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
    // Buttons re-register as they're drawn; nothing stale stays clickable.
    this.btns = [];
    this.artilleryBtn = null;
    const used = Object.values(s.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
    const bonus = Math.max(0, s.reactorBonus ?? 0);
    const free = s.reactor + (s.reactorBonus ?? 0) - used;
    const g = h.gfx("reactor");
    // Reactor: free power green from the bottom, used power as outlines; hatch and wire to the systems. Every
    // bar the reactor has is shown: past what FTL's column holds, the bars squeeze to fit below the crew list.
    const shown = s.reactor + bonus;
    const room = 686 - Math.max(this.crewListBottom, 330);
    const pitch = Math.max(2, Math.min(BAR_PITCH, Math.floor(room / Math.max(1, shown))));
    const bh = Math.max(1, Math.min(6, pitch - 2));
    for (let i = 0; i < shown; i++) {
      const yy = 686 - i * pitch;
      // Battery bars sit on top of the reactor's, in FTL's battery orange.
      if (i < free) g.rect(13, yy, 27, bh).fill({ color: i >= s.reactor ? 0xffa030 : 0x78ff78 });
      else g.rect(13.5, yy + 0.5, 26, Math.max(1, bh - 1)).stroke({ color: 0xe8ece8, width: 1 });
    }
    const systems = MAIN_SYS.map((id) => s.systems[id]).filter(Boolean) as NonNullable<ShipView["systems"][SystemId]>[];
    const lastX = systems.length ? this.lay.sysX[systems[systems.length - 1].id]! : SYS_X0;
    const right = lastX + 32 + 20;
    for (let yy = 627; yy < 690; yy += 6) g.moveTo(44, yy + 6).lineTo(50, yy).stroke({ color: 0x8a948c, width: 2 });
    g.moveTo(46, 690).lineTo(58, 704).lineTo(right, 704).stroke({ color: 0xe8ece8, width: 2.5 });
    for (const sys of systems) {
      const ix = this.lay.sysX[sys.id]!;
      const cx = ix + 32;
      g.moveTo(cx - 10, 704).lineTo(cx - 2, 696).stroke({ color: 0xe8ece8, width: 2 });
      this.bars(`b${sys.id}`, sys, cx, 657);
      if (this.manned(s, sys.id)) h.sprite(`mn${sys.id}`, texNow("systemUI/manning_white.png"), cx, 657 - sys.level * this.pitch(sys.level) - 2, { anchor: [0.5, 1], scale: 0.7 });
      const icon = texNow(`icons/s_${sys.id}_${this.iconState(sys)}1.png`) ?? texNow(`icons/s_${sys.id}_green1.png`);
      if (icon) {
        if (sys.ion <= 0 && this.lockLeft(s, sys.id) <= 0) h.sprite(`si${sys.id}`, icon, ix, SYS_ICON_Y, { tint: sys.hacked ? 0xd070ff : 0xffffff });
      } else if (sys.ion <= 0) h.text(`si${sys.id}`, sys.id.slice(0, 3).toUpperCase(), cx, SYS_ICON_Y + 32, fstyle("JustinFont10", 0xffffff), [0.5, 0.5]);
      this.sysHit.push({ id: sys.id, box: { x: cx - 16, y: 657 - sys.level * this.pitch(sys.level) - 4, w: 32, h: sys.level * this.pitch(sys.level) + 60 } });
      const top = 657 - sys.level * this.pitch(sys.level) - 8;
      if (sys.id === "teleporter") this.telePanel(s, sys, ix, SYS_ICON_Y);
      if (sys.id === "cloaking") this.cloakPanel(s, sys, ix, SYS_ICON_Y);
      if (sys.id === "hacking") this.hackPanel(s, sys, ix, SYS_ICON_Y);
      if (sys.id === "mind") this.mindPanel(s, sys, ix, SYS_ICON_Y);
      if (sys.id === "artillery") this.artilleryPanel(s, sys, cx, top);
      if (sys.id === "clonebay") this.cloneQueue(s, sys, ix);
      // A hacking drone on this system: FTL's purple hacked mark (the icon goes purple while it pulses).
      if (sys.locked) h.sprite(`hk${sys.id}`, texNow("icons/s_hacked.png"), cx + 10, SYS_ICON_Y + 12, { anchor: 0.5 });
    }
  }

  private trayDx = 0;
  private teleMode: "send" | "return" | "hack" | "mind" | "artillery" | null = null;
  /** Clickable system buttons drawn this frame; `why` says why a disabled one can't be used. */
  private btns: { box: Box; act?: () => void; why?: string; right?: () => void }[] = [];

  /** Power the system really has (reactor + Zoltan), as the button heights read it. */
  private powerOf(sys: NonNullable<ShipView["systems"][SystemId]>): number {
    return Math.max(0, Math.min(sys.power + (sys.bonus ?? 0), usable(sys)));
  }

  /**
   * FTL's system power button (cloaking, hacking, mind control, the battery), as in its SystemPowerButton:
   * standing right of the icon on the wire, `n` (1-4) picks the art whose height grows with power. While the
   * ability runs, the striped timer shows 2 + 3n countdown bars that drop away as its time runs out.
   */
  private powerButton(key: string, iconX: number, iconY: number, n: number, o: { base?: string; left?: number; duration?: number; off: boolean; selected?: boolean; why?: string; act: () => void }): void {
    const h = this.hud;
    const k = Math.max(1, Math.min(4, n));
    const x = iconX + 36;
    const y = iconY - 50;
    h.sprite(`${key}B`, texNow(o.base ?? `systemUI/button_cloaking${k}_base.png`), x, y);
    const box = { x: iconX + 46, y: iconY + 16 - (11 + 12 * k), w: 24, h: 11 + 12 * k };
    if (o.left !== undefined && o.left > 0) {
      const t = texNow(`systemUI/button_cloaking${k}_charging_on.png`);
      if (t) {
        const bars = 2 + 3 * k;
        const shownBars = Math.ceil(o.left / ((o.duration || 1) / bars));
        const hh = Math.min(t.height, 26 + Math.min(bars, shownBars) * 4);
        h.sprite(`${key}T`, frame(t, 0, t.height - hh, t.width, hh), x, y + t.height - hh);
      }
      return;
    }
    const hover = inBox(this.mouse, box);
    const img = o.off ? "off" : hover || o.selected ? "select2" : "on";
    h.sprite(`${key}I`, texNow(`systemUI/button_cloaking${k}_${img}.png`), x, y);
    this.btns.push(o.off ? { box, why: o.why } : { box, act: o.act });
  }

  /**
   * FTL's teleporter button beside its bars: send (top) lights when crew stand on the pad, return (bottom) when
   * crew are aboard the enemy; while it recharges the striped gauge fills instead.
   */
  private telePanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, iconX: number, iconY: number): void {
    const h = this.hud;
    const x = iconX + 35;
    const y = iconY - 36;
    const lv = Math.min(3, this.powerOf(sys));
    const cd = RULES.teleCooldown[lv] || 1;
    const k = lv > 0 ? Math.min(1, (s.tele ?? 0) / cd) : 0;
    const base = texNow("systemUI/button_teleport_base.png");
    if (!base) return;
    h.sprite("tpB", base, x, y);
    const panel = { x: x + 6, y: y + 6, w: 28, h: 50 };
    if (lv <= 0 || k < 1) {
      // Recharging (or unpowered): the striped gauge fills from the bottom.
      h.sprite("tpC0", texNow("systemUI/button_teleport_charging_off.png"), x, y);
      const on = texNow("systemUI/button_teleport_charging_on.png");
      if (on && k > 0) {
        const top = 10 + Math.round(43 * (1 - k));
        h.sprite("tpC1", frame(on, 0, top, 40, 53 - top), x, y + top);
      }
      this.btns.push({ box: panel, why: lv <= 0 ? "The teleporter needs power" : "The teleporter is charging" });
      return;
    }
    const v = this.view!;
    const g = this.own.geo;
    const onPad = s.crew.some((c) => c.owner === v.you && !c.dead && c.dying === undefined && c.drone === undefined && !c.mind && !c.beam && g.tiles.get(c.tile)?.room === sys.room);
    const away = v.ships[1 - v.you].crew.some((c) => c.owner === v.you && !c.dead && c.dying === undefined && c.drone === undefined && !c.mind);
    const sendBox = { x: x + 10, y: y + 10, w: 20, h: 20 };
    const backBox = { x: x + 10, y: y + 33, w: 20, h: 20 };
    const img = (ok: boolean, mode: "send" | "return", b: Box) => (!ok ? "off" : this.teleMode === mode || inBox(this.mouse, b) ? "select2" : "on");
    h.sprite("tpT", texNow(`systemUI/button_teleport_top_${img(onPad, "send", sendBox)}.png`), x, y);
    h.sprite("tpBt", texNow(`systemUI/button_teleport_bottom_${img(away, "return", backBox)}.png`), x, y);
    this.btns.push(
      onPad ? { box: sendBox, act: () => this.teleClick(s, true), right: () => void (this.teleMode = null) } : { box: sendBox, why: "Move crew onto the teleporter pad first" },
      away ? { box: backBox, act: () => this.teleClick(s, false), right: () => void (this.teleMode = null) } : { box: backBox, why: "No crew aboard the enemy ship to bring back" },
    );
    if (this.teleMode === "send" || this.teleMode === "return") h.text("tpHint", this.teleMode === "send" ? "Click an enemy room to board" : "Click the enemy room to retrieve from", OWN.cx, 588, fstyle("JustinFont10", 0x9ff0ff, { stroke: 0x101010 }), [0.5, 0]);
  }

  /** Cloaking: the button's height follows the cloak's power (its duration). */
  private cloakPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, iconX: number, iconY: number): void {
    const lv = Math.min(3, this.powerOf(sys));
    const c = s.cloak;
    this.powerButton("ck", iconX, iconY, Math.max(1, lv), {
      left: c?.t, duration: RULES.cloakDuration[Math.max(1, lv)], off: lv <= 0 || !!sys.hacked || (c?.cd ?? 0) > 0,
      why: lv <= 0 ? "Cloaking needs power" : sys.hacked ? "Cloaking is hacked" : "Cloaking is recharging",
      act: () => {
        play(this.db, ["cloak"]);
        this.send({ c: "cloak" });
      },
    });
  }

  /**
   * Hacking, one button as in FTL: it launches the drone (one drone part), then pulses it. One power high
   * until the drone has landed, then as high as the hacking power (the pulse's length).
   */
  private hackPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, iconX: number, iconY: number): void {
    const lv = Math.min(3, this.powerOf(sys));
    const hk = s.hack;
    const attached = !!hk?.attached;
    const flying = !!hk && !attached;
    // A Zoltan super shield keeps the hacking drone out (it can't get through to latch on).
    const superUp = (this.view!.ships[1 - this.view!.you].superShield ?? 0) > 0;
    const off = lv <= 0 || !!sys.hacked || flying || (attached && (hk?.cd ?? 0) > 0) || (!hk && ((s.droneParts ?? 0) <= 0 || superUp));
    this.powerButton("hk", iconX, iconY, attached ? Math.max(1, lv) : 1, {
      left: hk?.pulse, duration: RULES.hackPulse[Math.max(1, lv)], off, selected: this.teleMode === "hack",
      why: lv <= 0 ? "Hacking needs power" : flying ? "The hacking drone is on its way" : !hk && superUp ? "Super shields block the hacking drone" : !hk ? "No drone parts left" : "Hacking is recharging",
      act: () => {
        if (!hk) {
          play(this.db, ["powerUpSystem"]);
          this.teleMode = "hack";
        } else {
          play(this.db, ["hackStart"]);
          this.send({ c: "hackPulse" });
        }
      },
    });
    if (this.teleMode === "hack") this.hud.text("hkHint", "Click an enemy room to attach the hacking drone", OWN.cx, 588, fstyle("JustinFont10", 0xd8a0ff, { stroke: 0x101010 }), [0.5, 0]);
  }

  /** Mind control: FTL draws its button at the two-power height whatever the level; the timer shows control left. */
  private mindPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, iconX: number, iconY: number): void {
    const lv = Math.min(3, this.powerOf(sys));
    const v = this.view!;
    const held = [...v.ships[0].crew, ...v.ships[1].crew].find((c) => c.mind?.by === s.idx);
    this.powerButton("md", iconX, iconY, 2, {
      left: held?.mind?.t, duration: RULES.mindDuration[Math.max(1, lv)], off: lv <= 0 || !!sys.hacked || (s.mindCd ?? 0) > 0,
      selected: this.teleMode === "mind", why: lv <= 0 ? "Mind control needs power" : "Mind control is recharging",
      act: () => {
        play(this.db, ["powerUpSystem"]);
        this.teleMode = "mind";
      },
    });
    if (this.teleMode === "mind") this.hud.text("mdHint", "Click a room with enemy crew (theirs, or intruders here)", OWN.cx, 588, fstyle("JustinFont10", 0xd8a0ff, { stroke: 0x101010 }), [0.5, 0]);
  }

  /** The battery: FTL's three-high power button (its own base art), right of the right-most subsystem. */
  private batteryPanel(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, iconX: number, iconY: number): void {
    const b = s.battery;
    this.powerButton("bt", iconX, iconY, 3, {
      base: "systemUI/button_battery3_base.png", left: b?.t, duration: RULES.batteryDuration,
      off: usable(sys) <= 0 || !!sys.hacked || sys.ion > 0 || (b?.cd ?? 0) > 0, why: usable(sys) <= 0 ? "The battery is damaged" : "The battery is recharging",
      act: () => {
        play(this.db, ["batteryStart"]);
        this.send({ c: "battery" });
      },
    });
  }

  /**
   * The clone bay's queue, stacked above its bars as FTL draws it (clonebar_small_*): up to three boxes with the
   * dead crew members' portraits; the first fills green as it's cloned. Switched off, the top one fills from
   * the top in red as it's about to be lost.
   */
  private cloneQueue(s: ShipView, sys: NonNullable<ShipView["systems"][SystemId]>, iconX: number): void {
    const h = this.hud;
    const queue = s.crew.filter((c) => c.dead && c.clone !== undefined).sort((a, b) => (a.diedAt ?? 0) - (b.diedAt ?? 0) || a.id - b.id);
    if (!queue.length) return;
    const qx = iconX + 6;
    let bottom = 657 - (sys.level - 1) * this.pitch(sys.level) - 7;
    const n = Math.min(3, queue.length);
    const on = this.powerOf(sys) > 0 && !sys.hacked;
    const fill = texNow("systemUI/clonebar_small_fill.png");
    for (let i = 0; i < n; i++) {
      const part = n === 1 ? "solo" : i === 0 ? "bottom" : i === n - 1 ? "top" : "middle";
      const img = texNow(`systemUI/clonebar_small_${part}.png`);
      const off = i === n - 1 ? 29 : 23;
      if (img) h.sprite(`cq${i}`, img, qx, bottom - off);
      else h.gfx(`cqg${i}`).rect(qx + 8, bottom - 21, 36, 22).stroke({ color: 0xe8ece8, width: 2 });
      const wx = qx + 9;
      const wy = bottom - 20;
      if (i === 0 && on && fill) {
        const hh = Math.round((queue[0].clone ?? 0) * 20);
        if (hh > 0) h.sprite(`cqf${i}`, frame(fill, 0, 20 - hh, 34, hh), wx, wy + 20 - hh, { tint: 0x40ff40 });
      }
      if (i === n - 1 && queue.length > n) h.text(`cqn${i}`, `+${queue.length - (n - 1)}`, wx + 17, wy + 3, fstyle("JustinFont10", 0xffffff), [0.5, 0]);
      else {
        const c = queue[i];
        const race = this.db.animSheets[c.race] ? c.race : "human";
        const por = animFrame(this.db, `${race}_portrait`, 0);
        if (por) h.sprite(`cqp${i}`, por, wx + 17, wy + 10, { anchor: 0.5 });
      }
      if (i === n - 1 && !on && fill && (s.cloneDying ?? 0) > 0) {
        const hh = Math.round((s.cloneDying ?? 0) * 20);
        if (hh > 0) h.sprite(`cqd${i}`, frame(fill, 0, 0, 34, hh), wx, wy, { tint: 0xff3020, alpha: 0.85 });
      }
      bottom -= 23;
    }
  }

  /**
   * Bottom HUD layout for this frame, FTL's own (PlayerShipUI): from x 58, each main system takes 36 px, 54 if it
   * has a button beside it, and weapons / drones take 48 + 97 per slot because their trays sit right after
   * them. If a big build would run into the subsystems, the plain systems squeeze up (never the trays).
   */
  private lay: { sysX: Partial<Record<SystemId, number>>; weaponsBox: number; droneBox: number } = { sysX: {}, weaponsBox: TRAY.x, droneBox: 660 };
  private computeLayout(s: ShipView): void {
    const present = MAIN_SYS.filter((id) => s.systems[id]);
    const wslots = Math.max(2, Math.min(4, this.db.ships[s.bp]?.weaponSlots ?? 4));
    const dslots = Math.max(2, Math.min(4, this.db.ships[s.bp]?.droneSlots ?? 2));
    const tray = (id: SystemId) => id === "weapons" || id === "drones";
    const step = (id: SystemId) => (id === "weapons" ? 48 + wslots * 97 : id === "drones" ? 48 + dslots * 97 : BUTTON_SYS.includes(id) ? 54 : 36);
    const width = (id: SystemId) => (id === "weapons" ? 32 + 31 + 97 * wslots : id === "drones" ? 32 + 31 + 97 * dslots : BUTTON_SYS.includes(id) ? 80 : 64);
    const plain = present.slice(0, -1).filter((id) => !tray(id)).reduce((a, id) => a + step(id), 0);
    const fixed = present.slice(0, -1).filter(tray).reduce((a, id) => a + step(id), 0);
    const last = present[present.length - 1];
    const rightEdge = SYS_X0 + plain + fixed + (last ? width(last) : 0);
    const limit = SUB_X0 - 6;
    const f = rightEdge > limit && plain > 0 ? Math.max(0.55, 1 - (rightEdge - limit) / plain) : 1;
    const sysX: Partial<Record<SystemId, number>> = {};
    let x = SYS_X0;
    for (const id of present) {
      sysX[id] = Math.round(x);
      x += tray(id) ? step(id) : step(id) * f;
    }
    // A ship without a weapons system still shows its tray, after the last system.
    const weaponsBox = sysX.weapons !== undefined ? sysX.weapons + 32 : Math.round(x) + 32;
    const droneBox = sysX.drones !== undefined ? sysX.drones + 32 : weaponsBox + 31 + 97 * wslots;
    this.lay = { sysX, weaponsBox, droneBox };
    this.trayDx = weaponsBox - TRAY.x;
  }

  private artilleryBtn: Box | null = null;

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

  /** Bottom right: piloting, sensors, doors and the battery at FTL's fixed spots, with the SUBSYSTEMS tab and door buttons. */
  private subsystems(s: ShipView): void {
    const h = this.hud;
    const tab = texNow("box_subsystems4.png");
    const tabX = SUB_X0 + 7;
    if (tab) h.sprite("subTab", tab, tabX, 664);
    else h.gfx("subTabG").roundRect(1024, 666, 165, 34, 4).fill({ color: 0xd8e4dc });
    this.label("subT", "SUBSYSTEMS", tabX + 12, 669);
    for (const id of SUB_SYS) {
      const sys = s.systems[id];
      if (!sys) continue;
      const ix = SUB_X0 + (SUB_OFF[id] ?? 0);
      const cx = ix + 32;
      this.bars(`sb${sys.id}`, sys, cx, 639);
      if (this.manned(s, sys.id)) h.sprite(`smn${sys.id}`, texNow("systemUI/manning_white.png"), cx, 639 - sys.level * this.pitch(sys.level) - 2, { anchor: [0.5, 1], scale: 0.7 });
      const icon = texNow(`icons/s_${sys.id}_${this.iconState(sys)}1.png`);
      if (sys.locked) h.sprite(`hk${sys.id}`, texNow("icons/s_hacked.png"), cx + 10, SUB_ICON_Y + 12, { anchor: 0.5 });
      if (sys.id === "battery") this.batteryPanel(s, sys, ix, SUB_ICON_Y);
      if (icon) {
        if (sys.ion <= 0 && this.lockLeft(s, sys.id) <= 0) h.sprite(`ssi${sys.id}`, icon, ix, SUB_ICON_Y, { tint: sys.hacked ? 0xd070ff : 0xffffff });
      } else if (sys.ion <= 0) h.text(`ssi${sys.id}`, sys.id.slice(0, 3).toUpperCase(), cx, SUB_ICON_Y + 32, fstyle("JustinFont10", 0xffffff), [0.5, 0.5]);
    }
    this.doorBtns = [];
    if (s.systems.doors) {
      // FTL's door controls stand over the doors subsystem.
      const bx = SUB_X0 + (SUB_OFF.doors ?? 72) + 35;
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
      // FTL draws the bar's border white, and the part manning and chain boosts cut off the top (the bonus) as
      // a white block; chain weapons show their boosts as lights on the gun, not here.
      g.rect(bx + 4.5, by + 4.5, 5, full + 1).stroke({ color: w.powered ? 0xe8ece8 : 0x8a8e8a, width: 1 });
      if (ceil < full) g.rect(bx + 5, by + 5, 4, full - ceil).fill({ color: w.powered ? 0xe8ece8 : 0x8a8e8a });
      if (fill > 0) g.rect(bx + 5, by + 5 + full - fill, 4, fill).fill({ color: 0x78ff78 });
      // Power bars, bottom left, one per power the weapon needs.
      const pw = bp?.power ?? 1;
      for (let p = 0; p < pw; p++) {
        const py = by + SLOT.h - 11 - p * 8;
        if (w.powered) g.rect(bx + 12, py, 16, 6).fill({ color: 0x78ff78 });
        else g.rect(bx + 12.5, py + 0.5, 15, 5).stroke({ color: 0x8a8e8a, width: 1 });
      }
      const title = bp?.short ?? bp?.title ?? w.bp;
      h.text(`wn${i}`, title, bx + 54, by + 3, fstyle("JustinFont8", w.powered ? (ready ? 0xb8ffb8 : 0xffffff) : 0x9aa09a, { align: "center", wrap: 66 }), [0.5, 0]);
      if (bp?.chargeLevels && bp.chargeLevels > 1) h.text(`wcl${i}`, `${w.volleys}/${bp.chargeLevels}`, bx + 34, by + SLOT.h - 13, fstyle("JustinFont8", 0xffe070));
      // Slot number tag in the bottom-right corner.
      g.rect(bx + SLOT.w - 12, by + SLOT.h - 12, 11, 11).fill({ color: 0x0f1414 }).stroke({ color: edge, width: 1 });
      h.text(`wnum${i}`, String(i + 1), bx + SLOT.w - 6.5, by + SLOT.h - 12, fstyle("JustinFont8", 0xe8ece8), [0.5, 0]);
      if (w.autofire) h.text(`wa${i}`, "AUTO", bx + SLOT.w - 15, by + SLOT.h - 12, fstyle("JustinFont8", 0xffd040), [1, 0]);
      this.weapHit.push({ slot: i, box: { x: bx, y: by, w: SLOT.w, h: SLOT.h } });
    }
    // AUTOFIRE: a tab under the right end of the tray, lit when any weapon autofires.
    const anyAuto = this.autoMode;
    // Under the right end of the tray, whatever its size.
    const ax = TRAY.x + this.trayDx + 31 + 97 * slots - 126;
    const ay = 668;
    const ab = h.gfx("autoBtn");
    ab.poly([ax + 6, ay, ax + 112, ay, ax + 118, ay + 6, ax + 118, ay + 24, ax + 112, ay + 29, ax + 6, ay + 29, ax, ay + 24, ax, ay + 6])
      .fill({ color: anyAuto ? 0xd8e8b0 : 0x98a8a4 })
      .stroke({ color: anyAuto ? 0xfff2a0 : 0xd8e4dc, width: 2 });
    this.label("autoT", "AUTOFIRE", ax + 59, ay + 3, anyAuto ? 0x3a3a10 : 0x2a3434, anyAuto ? 0xfff8d0 : 0xc8d4d0, [0.5, 0]);
    this.autoBox = { x: ax, y: ay, w: 118, h: 29 };
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
    const x0 = this.lay.droneBox;
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
      const edge = d.deployed && d.powered ? 0x78ff78 : d.powered ? 0xffd040 : 0x8a8e8a;
      g.rect(bx + 1, by + 1, SLOT.w - 2, SLOT.h - 2).fill({ color: d.deployed && d.powered ? 0x1d3a1f : 0x0f1414, alpha: 0.9 }).stroke({ color: edge, width: 2 });
      for (let p = 0; p < bp.power; p++) {
        const py = by + SLOT.h - 11 - p * 8;
        if (d.powered) g.rect(bx + 5, py, 16, 6).fill({ color: 0x78ff78 });
        else g.rect(bx + 5.5, py + 0.5, 15, 5).stroke({ color: 0x8a8e8a, width: 1 });
      }
      const short = bp.title.replace(/ Drone/, "").replace("Mark ", "").trim();
      h.text(`dn${i}`, short.length > 14 ? `${short.slice(0, 13)}.` : short, bx + 54, by + 4, fstyle("JustinFont8", usableHere ? (d.powered ? 0xffffff : 0x9aa09a) : 0x707070), [0.5, 0]);
      const blocked = bp.type === "BOARDER" && !d.deployed && d.powered && (this.view!.ships[1 - this.view!.you].superShield ?? 0) > 0;
      const status = (d.rebuild ?? 0) > 0 ? `rebuilding ${Math.ceil(d.rebuild ?? 0)}s` : !usableHere ? "coming later" : blocked ? "super shield" : d.deployed && !d.powered ? "offline" : d.deployed ? (bp.type === "SHIP_REPAIR" ? `repair ${d.repairLeft ?? 0}` : "deployed") : d.powered ? ((s.droneParts ?? 0) > 0 ? "launching" : "no parts") : "";
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
    // Between snapshots the orbit angle is interpolated, so drones glide instead of stepping at 15 Hz.
    const was = this.prev?.ships[owner].drones?.[slot]?.angle ?? d.angle;
    const ang = was + (d.angle - was) * this.snapK;
    const lx = c.x + Math.cos(ang) * (b.w / 2 + 30);
    const ly = c.y + Math.sin(ang) * (b.h / 2 + 24);
    return this.stage.toLocal(r.root.toGlobal({ x: lx, y: ly }));
  }

  /** When each ship's hacking drone last landed (the probe extends over a moment). */
  private hackLandAt = new Map<number, number>();

  /**
   * Where a hacking drone clamps on (ship grid pixels) and its turn (the art's probe points down): the outer
   * wall of the target room, if the room reaches the outside on some side, else the nearest outer wall to it.
   */
  private hackSpot(r: ShipRenderer, room: number): { x: number; y: number; rot: number } | null {
    const g = r.geo;
    const own = g.roomTiles.get(room);
    if (!own?.length) return null;
    const dirs: [number, number, number][] = [[0, -1, 0], [-1, 0, -Math.PI / 2], [0, 1, Math.PI], [1, 0, Math.PI / 2]];
    const outer = (tiles: string[]) =>
      tiles.flatMap((t) => {
        const [tx, ty] = t.split(",").map(Number);
        return dirs
          .filter(([dx, dy]) => {
            for (let i = 1; i < 40; i++) if (g.tiles.has(`${tx + dx * i},${ty + dy * i}`)) return false;
            return true;
          })
          .map(([dx, dy, rot]) => ({ x: (tx + 0.5 + dx * 0.5) * 35, y: (ty + 0.5 + dy * 0.5) * 35, rot }));
      });
    const xs = own.map((t) => Number(t.split(",")[0]));
    const ys = own.map((t) => Number(t.split(",")[1]));
    const cx = ((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * 35;
    const cy = ((Math.min(...ys) + Math.max(...ys)) / 2 + 0.5) * 35;
    const cands = outer(own);
    const pool = cands.length ? cands : outer([...g.tiles.keys()]);
    if (!pool.length) return null;
    return pool.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cy) < Math.hypot(a.x - cx, a.y - cy) - 0.01 ? b : a));
  }

  /** Where each drone (`ship:slot`) last aimed, in stage coordinates. */
  private droneAim = new Map<string, { x: number; y: number }>();
  private droneRot = new Map<string, number>();

  /** Ease a sprite's rotation toward `target` at `rate` (per second; 0 holds it), the short way round. */
  private turn(key: string, target: number, rate: number): number {
    const cur = this.droneRot.get(key);
    if (cur === undefined) {
      this.droneRot.set(key, target);
      return target;
    }
    let diff = (target - cur) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    const next = cur + diff * Math.min(1, this.frameDt * rate);
    this.droneRot.set(key, next);
    return next;
  }

  /** Hacking drones (by owner) that went up with a ship's break-up. */
  private hackBlown = new Set<number>();

  private drawDrones(v: MatchView): void {
    // A ship that's blowing up: every drone circling it, and every drone of its own, goes offline at the first
    // blast; a hacking drone clamped to it (or one it sent) explodes when it breaks apart.
    const dying = (i: number) => this.explodedAt.has(i);
    const broken = (i: number) => this.explodedAt.has(i) && this.time >= this.explodedAt.get(i)!;
    // Hacking drones clamp onto the hull just outside the room they hacked (never over a room), probe in; while
    // a pulse runs, purple lightning crackles across the room.
    for (const s of v.ships) {
      if (!s.hack?.attached || this.hackBlown.has(s.idx)) continue;
      const r = s.idx === v.you ? this.enemy : this.own;
      const spot = this.hackSpot(r, s.hack.room);
      const strip = texNow("ship/drones/drone_hack_extend.png");
      if (!spot) continue;
      if (broken(s.idx) || broken(1 - s.idx)) {
        this.hackBlown.add(s.idx);
        this.boom(1 - s.idx, spot.x, spot.y, 1.1);
        play(this.db, ["explosion1", "explosion2", "explosion3", "explosion4"], 0.6);
        continue;
      }
      const pulsing = s.hack.pulse > 0 && !dying(s.idx) && !dying(1 - s.idx);
      const layer = s.idx === v.you ? this.projWin : this.projOwn;
      const at = this.stage.toLocal(r.root.toGlobal({ x: spot.x, y: spot.y }));
      const landed = this.time - (this.hackLandAt.get(s.idx) ?? -9);
      const fr = Math.min(4, Math.floor(landed / 0.1));
      if (strip) {
        // The drone's head clamps to the hull with its legs out in space (turned to face whichever wall it's on).
        const sp = new Sprite(frame(strip, fr * 31, 0, 31, 49));
        sp.anchor.set(0.5, 0.1);
        sp.position.set(at.x, at.y);
        sp.rotation = spot.rot + Math.PI + r.root.rotation;
        layer.addChild(sp);
        if (pulsing) {
          const lt = texNow(Math.floor(this.animTime * 6) % 2 ? "ship/drones/drone_hack_light1.png" : "ship/drones/drone_hack_light2.png");
          if (lt) {
            const l = new Sprite(lt);
            l.anchor.set(0.5, 0.1);
            l.position.set(at.x, at.y);
            l.rotation = sp.rotation;
            layer.addChild(l);
          }
        }
      }
      if (pulsing) {
        const tiles = r.geo.roomTiles.get(s.hack.room) ?? [];
        const seed = Math.floor(this.animTime * 12);
        const g = new Graphics();
        for (let i = 0; i < 3 && tiles.length; i++) {
          const [tx, ty] = tiles[Math.floor(hash01(seed * 7 + i) * tiles.length)].split(",").map(Number);
          const end = this.stage.toLocal(r.root.toGlobal({ x: (tx + 0.2 + 0.6 * hash01(seed + i * 3)) * 35, y: (ty + 0.2 + 0.6 * hash01(seed + i * 5)) * 35 }));
          const pts: [number, number][] = [[at.x, at.y]];
          for (let j = 1; j < 6; j++) {
            const q = j / 6;
            pts.push([at.x + (end.x - at.x) * q + (hash01(seed * 31 + i * 11 + j) - 0.5) * 14, at.y + (end.y - at.y) * q + (hash01(seed * 17 + i * 13 + j) - 0.5) * 14]);
          }
          pts.push([end.x, end.y]);
          for (const [w, c, al] of [[5, 0x9a40ff, 0.35], [2, 0xe0b0ff, 0.95]] as const) {
            g.moveTo(pts[0][0], pts[0][1]);
            for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
            g.stroke({ color: c, width: w, alpha: al });
          }
        }
        layer.addChild(g);
      }
    }
    const layerFor = (owner: 0 | 1, type: string) => ((owner === v.you) !== (type === "COMBAT") ? this.projOwn : this.projWin);
    for (const owner of [0, 1] as const) {
      for (const d of v.ships[owner].drones ?? []) {
        const bp = this.db.droneBPs[d.bp];
        if (!bp || !d.deployed || UNIT_DRONES.includes(bp.type)) continue;
        const p = this.dronePos(owner, d.slot);
        if (!p) continue;
        // Offline drones (their power cut, or the ship they belong to or circle blowing up) go dark and drift
        // where they are.
        const circled = (owner === v.you) !== (bp.type === "COMBAT") ? v.you : 1 - v.you;
        const on = d.powered && !dying(owner) && !dying(circled);
        const t = (on ? texNow(`ship/drones/${bp.image}_on.png`) ?? texNow(`ship/drones/${bp.image}_charged.png`) : null) ?? texNow(`ship/drones/${bp.image}_base.png`) ?? texNow(`ship/drones/${bp.image}_off.png`);
        const layer = layerFor(owner, bp.type);
        // The art points up: turn it toward what it last shot at, else the ship it circles (combat) or
        // away from its own ship (defense, repair).
        const r = (owner === v.you) !== (bp.type === "COMBAT") ? this.own : this.enemy;
        const c = this.stage.toLocal(r.root.toGlobal(r.gridCentre()));
        const aim = this.droneAim.get(`${owner}:${d.slot}`);
        const face = bp.type === "COMBAT" ? (aim ?? c) : { x: 2 * p.x - c.x, y: 2 * p.y - c.y };
        // Turn toward the new heading gradually rather than snapping to it.
        const rot = this.turn(`d${owner}:${d.slot}`, Math.atan2(face.y - p.y, face.x - p.x) + Math.PI / 2, on ? 7 : 0);
        if (t) {
          const sp = new Sprite(t);
          sp.anchor.set(0.5);
          sp.position.set(p.x, p.y);
          sp.scale.set(0.8);
          sp.rotation = bp.type === "DEFENSE" ? 0 : rot;
          if (owner !== v.you) sp.tint = 0xffd0d0;
          layer.addChild(sp);
          // Shield Overcharger mid-charge: it holds still (the sim stops its orbit), glows, and arcs energy
          // into its ship's shield.
          const sup = v.ships[owner].superShield ?? 0;
          if (bp.type === "SHIELD" && on && d.cd <= RULES.shieldDroneCharge && sup < RULES.shieldDroneMax) {
            const k = 1 - Math.max(0, d.cd) / RULES.shieldDroneCharge;
            const pulse = 0.55 + 0.45 * Math.sin(this.time * 18);
            const glow = texNow(`ship/drones/${bp.image}_glow.png`);
            if (glow) {
              const gs = new Sprite(glow);
              gs.anchor.set(0.5);
              gs.position.set(p.x, p.y);
              gs.scale.set(0.8 + 0.12 * k);
              gs.rotation = rot;
              gs.alpha = pulse;
              layer.addChild(gs);
            }
            const g = new Graphics();
            const dx = c.x - p.x;
            const dy = c.y - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const reach = Math.min(len * 0.45, 34 + 30 * k);
            for (let j = 0; j < 3; j++) {
              const seed = Math.floor(this.time * 20) + j * 7;
              g.moveTo(p.x, p.y);
              for (let q = 1; q <= 4; q++) {
                const f = (q / 4) * reach;
                const off = (hash01(seed * 13 + q) - 0.5) * 9;
                g.lineTo(p.x + (dx / len) * f - (dy / len) * off, p.y + (dy / len) * f + (dx / len) * off);
              }
            }
            g.stroke({ color: 0x9cffc8, width: 1.5, alpha: 0.5 + 0.4 * pulse });
            g.circle(p.x, p.y, 10 + 6 * pulse).stroke({ color: 0x9cffc8, width: 1, alpha: 0.35 * pulse });
            layer.addChild(g);
          }
          // Defense drones: a gun turret on top, turned toward the last shot it took down.
          const gun = bp.type === "DEFENSE" ? texNow(`ship/drones/${bp.image}_gun_on.png`) ?? texNow(`ship/drones/${bp.image}_gun.png`) : null;
          if (gun) {
            const gs = new Sprite(gun);
            gs.anchor.set(0.5);
            gs.position.set(p.x, p.y);
            gs.scale.set(0.8);
            gs.rotation = this.turn(`g${owner}:${d.slot}`, aim ? Math.atan2(aim.y - p.y, aim.x - p.x) + Math.PI / 2 : rot, on ? 9 : 0);
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
    if (this.pauseBox && inBox(p, this.pauseBox)) return this.togglePause();
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
      const offline = d.deployed;
      if (!ACTIVE_DRONES.includes(bp.type)) return this.fail("This drone isn't in the arena yet");
      const ds = own.systems.drones;
      if (!ds || ds.ion > 0) return this.fail(ds ? "Drones are locked by ion damage" : "No drone system");
      const load = (own.drones ?? []).filter((q) => q.powered).reduce((a, q) => a + (this.db.droneBPs[q.bp]?.power ?? 1), 0);
      if (load + bp.power > usable(ds)) return this.fail("Not enough drone system power");
      // The drone system draws more reactor if it needs to; refuse (quietly, with FTL's buzz) if there's none.
      const usedR = Object.values(own.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
      const extra = Math.max(0, load + bp.power - ds.power - (ds.bonus ?? 0));
      if (usedR + extra > own.reactor + (own.reactorBonus ?? 0)) return this.fail("Not enough available power");
      // An offline drone is still out there: it comes back on without a new part.
      if (!offline && (own.droneParts ?? 0) <= 0) return this.fail("No drone parts left");
      // A boarding drone can be powered behind a super shield, but it waits until the shield is down.
      const held = bp.type === "BOARDER" && !offline && (v.ships[1 - v.you].superShield ?? 0) > 0;
      play(this.db, held || offline ? ["powerUpSystem"] : ["powerUpSystem", "droneLaunch"]);
      if (held) this.say("Super shields: the boarding drone waits until they're down", 0xffd040);
      this.send({ c: "dronePower", slot: dh.slot, on: true });
      return;
    }
    for (const b of this.stationBtns) {
      if (!inBox(p, b.box)) continue;
      const g = this.own.geo;
      if (b.kind === "assign") {
        // Only crew aboard (and not mind controlled) are saved; boarders and the dead keep their old spot, or none.
        for (const c of own.crew) if (!c.dead && c.dying === undefined && c.owner === v.you && c.drone === undefined && !c.mind && !c.beam) this.savedStations.set(c.id, g.tiles.get(c.home)!.room);
        play(this.db, ["powerUpSystem"]);
        this.say("Crew positions saved");
      } else {
        if (!this.savedStations.size) return this.fail("No crew positions saved yet");
        for (const [id, room] of this.savedStations) if (own.crew.find((c) => c.id === id && !c.dead && c.owner === v.you && !c.mind)) this.send({ c: "moveCrew", crew: [id], room });
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
    for (const b of this.btns) {
      if (!inBox(p, b.box)) continue;
      if (right) {
        this.teleMode = null;
        b.right?.();
        return;
      }
      if (b.act) return b.act();
      return this.fail(b.why ?? "Not available");
    }
    if (this.artilleryBtn && inBox(p, this.artilleryBtn)) {
      if (right) return this.send({ c: "artilleryTarget", room: null });
      play(this.db, ["powerUpSystem"]);
      this.teleMode = "artillery";
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
        if ((v.ships[1 - v.you].superShield ?? 0) > 0) return this.fail("Super shields block the hacking drone");
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
      // Right-click while choosing a target: the weapon stops aiming altogether (its old target is cleared).
      if (right) {
        this.send({ c: "target", slot: this.armed, target: null });
        play(this.db, ["powerDownSystem"]);
        return this.disarm();
      }
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
      // Drones are powered one at a time from their boxes in the drone tray (clicking the system itself never
      // launches one); right-click switches off the last powered drone.
      const ds = own.drones ?? [];
      if (delta > 0) return this.fail("Power drones from the drone tray");
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
      if ((bp?.missiles ?? 0) > own.missiles) return this.fail("No missiles left for this weapon");
      const load = own.weapons.filter((q) => q.powered).reduce((a, q) => a + (this.db.weapons[q.bp]?.power ?? 1), 0);
      const need = load + (bp?.power ?? 1);
      const used = Object.values(own.systems).reduce((a, x) => a + (x && !SUBSYSTEMS.includes(x.id) ? x.power : 0), 0);
      const extra = Math.max(0, need - (ws ? ws.power + (ws.bonus ?? 0) : 0));
      if (!ws || need > usable(ws)) return this.fail("Not enough weapon system power");
      if (used + extra > own.reactor + (own.reactorBonus ?? 0)) return this.fail("Not enough available power");
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
    if (e.key === " ") {
      e.preventDefault();
      this.togglePause();
    } else if (/^[1-4]$/.test(e.key)) this.clickWeapon(Number(e.key) - 1, false);
    else if (e.key === "Escape") this.disarm();
    else if (e.key.toLowerCase() === "a" && this.armed !== null) this.send({ c: "autofire", slot: this.armed, on: !own.weapons[this.armed].autofire });
    // (M used to switch sound effects off, saved for good: one stray press and they were gone with nothing
    // on screen to say why. Off for now; setSound() is still there if a visible toggle comes back.)
    else if (e.key.toLowerCase() === "n") {
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
