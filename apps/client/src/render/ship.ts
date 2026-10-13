/**
 * Draws one ship. The container's origin is the room grid's top-left (tile 0,0) in grid pixels, so sim
 * coordinates map 1:1. Hull art sits at the layout's <img> offset, the floor at <img> + <floor>, weapon
 * mounts relative to the hull image. `upright` is the rotation that cancels the container's own rotation
 * (the enemy ship is drawn rotated to stand vertically), so icons and crew stay upright on screen.
 * Falls back to flat shapes without extracted art.
 */
import { Container, Graphics, Sprite, TilingSprite, type Texture } from "pixi.js";
import { baseSystemId, type GameDB, type ShipLayout } from "@ftl/data";
import { geometry, RULES, TILE, usable, type CrewState, type Geometry, type ShipView } from "@ftl/sim";
import { animFrame, frame, shieldFile, texNow, weaponFrame } from "../assets.ts";
import { Imm, style } from "../imm.ts";

const FLOOR = 0xe6e2db;
const GRID = 0xb9b4aa;
const WALL = 0x111111;

export interface CrewDraw {
  c: CrewState;
  x: number;
  y: number;
  selected: boolean;
  /** Belongs to the other player (intruders on your ship, defenders on theirs). */
  hostile?: boolean;
  /** Drone units: their drone is switched off. */
  offline?: boolean;
}

/** Point in a swing (0..1) where the shot leaves the gun. */
export const SHOT_AT = 0.45;

/**
 * Where a shooter is in their swing (0..1), or null when they aren't shooting. Fights use the sim's swing
 * timer; breaking a door and wrecking a system fire on a steady ~1.2 s rhythm of their own.
 */
export function attackPhase(c: CrewState, time: number): number | null {
  if (c.dead || c.dying !== undefined || c.blip || (c.task !== "fight" && c.task !== "sabotage")) return null;
  if (c.task === "fight" && c.punch) return null;
  if (c.task === "fight" && c.atk !== undefined && c.atkDur) return Math.max(0, Math.min(0.999, 1 - c.atk / c.atkDur));
  return (time * 0.85 + c.id * 0.37) % 1;
}

/** Share of health below which a crew member's box turns red and the low-health warning beeps. */
export const LOW_HP = 0.25;


/** The centre of a picture's solid pixels, in its own pixels; once per picture. (Solid: FTL's "glow" hull art
 *  has a faint halo round the ship, which mustn't count.) */
const opaqueCache = new Map<string, { x: number; y: number } | null>();
function opaqueCentre(tex: Texture): { x: number; y: number } | null {
  const key = String(tex.source.uid);
  if (opaqueCache.has(key)) return opaqueCache.get(key)!;
  let out: { x: number; y: number } | null = null;
  try {
    const res = tex.source.resource as CanvasImageSource | undefined;
    const w = tex.source.pixelWidth;
    const h = tex.source.pixelHeight;
    if (res && w > 0 && h > 0) {
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(res, 0, 0);
      const px = ctx.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (px[(y * w + x) * 4 + 3] > 200) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      // (Texture pixels to art pixels: the source may be at a different resolution.)
      const k = tex.frame.width / w;
      if (x1 >= 0) out = { x: ((x0 + x1 + 1) / 2) * k, y: ((y0 + y1 + 1) / 2) * k };
    }
  } catch {
    out = null;
  }
  opaqueCache.set(key, out);
  return out;
}

export interface ShipDrawOpts {
  hover: { room: number; door: number };
  /** Weapon art frame per slot (charging lights / firing). */
  weaponFrame?: (slot: number) => number | undefined;
  /** Seconds since the last shield hit (bubble flash). */
  shieldFlash?: number;
  /** Seconds since the hull broke apart, or null. */
  exploded?: number | null;
  /** A dying ship: only its outside shows (hull art and guns), the rooms and crew hidden, the shields down. */
  exterior?: boolean;
  /** Seconds since some pieces broke off a ship that stays whole otherwise (the flagship before it escapes). */
  shed?: number | null;
  /** Show green destination tiles for walking crew (own ship). */
  destinations?: boolean;
  /** Recently ordered destination tiles: tile key -> seconds left. */
  flashTiles?: Map<string, number>;
  /** Engines' effective power (thruster glow). */
  engines?: number;
  /** Cloaked: the ship fades into FTL's translucent cloak look. */
  cloaked?: boolean;
  /** Wall-clock time: doors keep opening and closing on it while the match is paused (the rest freezes). */
  clock?: number;
}

export class ShipRenderer {
  root = new Container();
  private hull = new Container();
  /** The floor art (FTL's room-layout template under the rooms): its own layer, hidden with the interior when
   *  only the exterior shows (a ship going up). It used to sit in `hull` and stay visible. */
  private floorArt = new Container();
  private floorG = new Graphics();
  private interior = new Container();
  private dynRoot = new Container();
  private dyn: Imm;
  private fog = new Graphics();
  /** Public so an escaping ship's broken-off pieces can fly free of its fade (battle.ts re-parents them). */
  gibRoot = new Container();
  private gibs: Imm;
  overlay = new Graphics();
  /** Sprite layer above everything for targeting reticles. */
  marksRoot = new Container();
  marks: Imm;
  private thrusterRoot = new Container();
  /** Weapons sit behind the hull art, poking out at their mounts. */
  private weaponRoot = new Container();
  private weaponsImm: Imm;
  private thrusters: Imm;
  private nozzles: { x: number; y: number; h: number }[] | null = null;
  private retract: number[] = [];
  private lastTime = 0;
  private shieldArt: Sprite | null = null;
  private superArt: Sprite | null = null;
  private shieldG = new Graphics();
  readonly geo: Geometry;
  readonly layout: ShipLayout;
  private built = false;
  private doorAnim: { open: boolean; t: number }[] = [];
  private stripes = new Map<number, TilingSprite>();
  private stripeRoot = new Container();
  /** The room walls again, over the low-air stripes (so borders always show). */
  private wallsG = new Graphics();

  constructor(public db: GameDB, public shipId: string, public enemy: boolean, public upright = 0) {
    const bp = db.ships[shipId];
    this.layout = db.layouts[bp.layout];
    this.geo = geometry(this.layout);
    this.dyn = new Imm(this.dynRoot);
    this.gibs = new Imm(this.gibRoot);
    this.marks = new Imm(this.marksRoot);
    this.thrusters = new Imm(this.thrusterRoot);
    this.weaponsImm = new Imm(this.weaponRoot);
    this.root.addChild(this.shieldG, this.thrusterRoot, this.weaponRoot, this.hull, this.floorArt, this.floorG, this.interior, this.stripeRoot, this.wallsG, this.fog, this.dynRoot, this.overlay, this.marksRoot, this.gibRoot);
  }

  /** img/<dir>/<img>_<suffix>.png for this hull (player hulls in ship/, enemy hulls in ships_glow/). */
  art(suffix: string): string {
    const bp = this.db.ships[this.shipId];
    return `${bp.artDir ?? "ship"}/${bp.img}_${suffix}.png`;
  }

  hasArt(): boolean {
    return !!texNow(this.art("base"));
  }

  /** Single-player enemy hulls (the flagship too) are drawn vertically in their own art. */
  get nativeVertical(): boolean {
    return !!this.db.ships[this.shipId].enemy;
  }

  /** Grid-pixel bounds of the hull art (or rooms when there's no art). */
  bounds(): { x: number; y: number; w: number; h: number } {
    const L = this.layout;
    if (L.img.w > 0 && this.hasArt()) return { ...L.img };
    const g = this.gridBox();
    return { x: g.x - 40, y: g.y - 40, w: g.w + 80, h: g.h + 80 };
  }

  gridBox() {
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const r of this.layout.rooms) {
      x1 = Math.min(x1, r.x * TILE); y1 = Math.min(y1, r.y * TILE);
      x2 = Math.max(x2, (r.x + r.w) * TILE); y2 = Math.max(y2, (r.y + r.h) * TILE);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  gridCentre(): { x: number; y: number } {
    const g = this.gridBox();
    return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  }

  private buildStatic(v?: ShipView): void {
    const bp = this.db.ships[this.shipId];
    const L = this.layout;
    this.hull.removeChildren();
    this.floorArt.removeChildren();
    this.interior.removeChildren();
    const base = texNow(this.art("base"));
    // Type C hulls have no floor of their own: they use the A hull's (floorImg).
    const floor = bp.enemy ? null : texNow(bp.floorImg ? `${bp.artDir ?? "ship"}/${bp.floorImg}_floor.png` : this.art("floor"));
    if (base) {
      const s = new Sprite(base);
      s.position.set(L.img.x, L.img.y);
      this.hull.addChild(s);
      if (floor) {
        const f = new Sprite(floor);
        f.position.set(L.img.x + L.floor.x, L.img.y + L.floor.y);
        this.floorArt.addChild(f);
      }
    } else {
      const b = this.bounds();
      this.hull.addChild(new Graphics().roundRect(b.x, b.y, b.w, b.h, 60).fill({ color: 0x3b4252 }).stroke({ color: 0x8892a6, width: 3 }));
    }
    const g = this.floorG.clear();
    for (const r of L.rooms) {
      g.rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).fill({ color: FLOOR });
      for (let i = 1; i < r.w; i++) g.moveTo((r.x + i) * TILE, r.y * TILE).lineTo((r.x + i) * TILE, (r.y + r.h) * TILE);
      for (let j = 1; j < r.h; j++) g.moveTo(r.x * TILE, (r.y + j) * TILE).lineTo((r.x + r.w) * TILE, (r.y + j) * TILE);
      g.stroke({ color: GRID, width: 1 });
    }
    for (const r of L.rooms) g.rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).stroke({ color: WALL, width: 3 });
    const wg = this.wallsG.clear();
    for (const r of L.rooms) wg.rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).stroke({ color: WALL, width: 3 });
    // Interiors for the systems actually installed (a bought clone bay replaces the medbay art).
    for (const s of bp.systems) {
      const installed = v ? !!v.systems[s.id] : s.start;
      const r = L.rooms.find((q) => q.id === s.room);
      if (!installed || !r) continue;
      if (s.id === "clonebay") {
        // The cloning tub stands on the tile it blocks (its <slot>), as in FTL.
        const [tx, ty] = this.cloneTile(v, r);
        for (const part of ["clone_bottom", "clone_top"]) {
          const t = texNow(`ship/interior/${part}.png`);
          if (!t) continue;
          const sp = new Sprite(t);
          sp.position.set(tx * TILE, ty * TILE);
          this.interior.addChild(sp);
        }
        continue;
      }
      if (!s.img) continue;
      const t = texNow(`ship/interior/${s.img}.png`);
      if (!t) continue;
      const sp = new Sprite(t);
      sp.position.set(r.x * TILE, r.y * TILE);
      this.interior.addChild(sp);
    }
    const sh = texNow(bp.enemy ? "ship/enemy_shields.png" : shieldFile(bp.img, bp.shieldImg));
    const c = this.gridCentre();
    if (sh && !this.shieldArt) {
      this.shieldArt = new Sprite(sh);
      this.shieldArt.anchor.set(0.5);
      this.shieldArt.position.set(c.x + L.ellipse.x, c.y + L.ellipse.y);
      // Enemy layouts' ellipse offsets are for FTL's own window placement; centre on the hull instead: on the
      // visible part of its art (hull images often have uneven empty canvas round them, which would put the
      // bubble off-centre), measured from the picture itself.
      if (bp.enemy) {
        const base = texNow(this.art("base"));
        const vis = base ? opaqueCentre(base) : null;
        if (vis) this.shieldArt.position.set(L.img.x + vis.x, L.img.y + vis.y);
        else if (/^BOSS_/.test(this.shipId)) this.shieldArt.position.set(c.x, c.y);
        else this.shieldArt.position.set(L.img.x + L.img.w / 2, L.img.y + L.img.h / 2);
      }
      // One-off nudges where a hull's art canvas has uneven empty space, so its centre isn't the hull's.
      // The ship class's enemy.shieldNudge (packages/content).
      const nudge = this.db.ships[this.shipId].shieldNudge;
      if (nudge) this.shieldArt.position.set(this.shieldArt.position.x + (nudge.x ?? 0), this.shieldArt.position.y + (nudge.y ?? 0));
      if (bp.enemy && L.ellipse.a > 0) {
        this.shieldArt.width = L.ellipse.a * 2;
        this.shieldArt.height = L.ellipse.b * 2;
      }
      this.root.addChildAt(this.shieldArt, 0);
      // The Zoltan (super) shield: the same bubble in FTL's energy green, a little larger, over the hull.
      this.superArt = new Sprite(sh);
      this.superArt.anchor.set(0.5);
      this.superArt.position.copyFrom(this.shieldArt.position);
      this.superArt.width = this.shieldArt.width * 1.04;
      this.superArt.height = this.shieldArt.height * 1.04;
      this.superArt.tint = 0x8cff3a;
      this.superArt.alpha = 0;
      this.root.addChildAt(this.superArt, 1);
    }
    if (base && !bp.enemy) this.nozzles = findNozzles(base);
    this.built = Boolean(base) || this.db.source !== "ftl";
  }

  /** Tile (grid coords) of the clone bay's tub: the tile it blocks, else the room's first. */
  private cloneTile(v: ShipView | undefined, r: { x: number; y: number }): [number, number] {
    const b = v?.systems.clonebay?.blocked;
    return b ? (b.split(",").map(Number) as [number, number]) : [r.x, r.y];
  }

  /** Fire tiles seen last frame, so a fire that goes out can puff its smoke. */
  private lastFires = new Set<string>();
  private smoke = new Map<string, number>();

  update(v: ShipView, crew: CrewDraw[], time: number, o: ShipDrawOpts): void {
    if (!this.built) this.buildStatic(v);
    const L = this.layout;
    const up = this.upright;
    const d = this.dyn;
    const exploded = o.exploded ?? null;
    for (const n of [this.hull, this.floorArt, this.floorG, this.interior, this.dynRoot, this.fog, this.stripeRoot, this.wallsG, this.weaponRoot, this.thrusterRoot]) n.visible = exploded === null;
    // Dying: the exterior sprite only (FTL hides the rooms as a ship goes up).
    if (o.exterior && exploded === null) for (const n of [this.floorArt, this.floorG, this.interior, this.dynRoot, this.fog, this.stripeRoot, this.wallsG]) n.visible = false;
    // Cloaking: fade toward FTL's half-there look (eased so it doesn't pop).
    const want = o.cloaked ? 0.4 : 1;
    this.root.alpha += (want - this.root.alpha) * 0.15;
    if (this.shieldArt) this.shieldArt.visible = exploded === null && !o.exterior;
    if (exploded !== null) {
      this.drawGibs(exploded);
      return;
    }
    this.gibRoot.visible = false;
    if (o.shed !== undefined && o.shed !== null) this.drawGibs(o.shed, true);
    d.begin();
    // A room is seen when the server listed it (boarders, no-sensor rooms with own crew), else by sensors.
    const visible = (room: number) => (v.visibleRooms ? v.visibleRooms.includes(room) : v.interior);
    const g = d.gfx("rooms");
    // Low O2: pink tint, plus FTL's warning stripes from the level crew start suffocating at.
    for (const rs of v.rooms) {
      const r = L.rooms.find((q) => q.id === rs.id)!;
      const known = rs.o2 >= 0 && visible(rs.id);
      if (known && rs.o2 < 66) g.rect(r.x * TILE + 2, r.y * TILE + 2, r.w * TILE - 4, r.h * TILE - 4).fill({ color: 0xff3b6b, alpha: ((66 - rs.o2) / 66) * 0.42 });
      this.stripe(r, known && rs.o2 < RULES.suffocateAt);
    }
    if (o.hover.room >= 0) {
      const r = L.rooms.find((q) => q.id === o.hover.room);
      if (r) g.rect(r.x * TILE + 2, r.y * TILE + 2, r.w * TILE - 4, r.h * TILE - 4).stroke({ color: this.enemy ? 0xff5555 : 0x7bd47b, width: 3 });
    }
    // Destination tiles: FTL lights the tile a crew member is walking to.
    if (o.destinations) {
      const dest = texNow("people/green_destination.png");
      const tiles = new Set<string>();
      for (const cd of crew) if (!cd.c.dead && !cd.hostile && cd.c.drone === undefined && cd.c.path.length) tiles.add(cd.c.home);
      for (const [t, left] of o.flashTiles ?? []) if (left > 0) tiles.add(t);
      for (const t of tiles) {
        const [x, y] = t.split(",").map(Number);
        if (dest) d.sprite(`dest${t}`, dest, x * TILE, y * TILE, { alpha: 0.9 });
        else g.rect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2).fill({ color: 0x3cff3c, alpha: 0.35 });
      }
    }
    // Clone bay gas while someone is being cloned.
    const cbs = v.systems.clonebay;
    const gas = texNow("ship/interior/clone_gas.png");
    if (cbs && gas && v.crew.some((c) => c.dead && c.clone !== undefined)) {
      const r = L.rooms.find((q) => q.id === cbs.room)!;
      const [tx, ty] = this.cloneTile(v, r);
      d.sprite("cgas", gas, tx * TILE, ty * TILE, { alpha: 0.5 + 0.3 * Math.sin(time * 4) });
    }
    // Hazards
    {
      for (const rs of v.rooms) {
        if (!visible(rs.id)) continue;
        // A breach is a state, not a loop: the crack shrinks back through its frames as it's repaired.
        for (const [t, hp] of Object.entries(rs.breaches)) this.tileAnim(`br${t}`, t, animFrame(this.db, "breach", Math.max(0, Math.min(6, Math.ceil((hp / 100) * 7) - 1))), 0x2a2a2a, 1);
        for (const t of Object.keys(rs.fires)) this.tileAnim(`fi${t}`, t, animFrame(this.db, "fire_large", Math.floor(time * 10 + t.length)), 0xff7a1a, 0.9);
      }
      // A fire that goes out leaves FTL's puff of smoke (fire_smoke, 7 frames).
      const now = new Set<string>();
      for (const rs of v.rooms) if (visible(rs.id)) for (const t of Object.keys(rs.fires)) now.add(t);
      for (const t of this.lastFires) if (!now.has(t)) this.smoke.set(t, time);
      this.lastFires = now;
      const sm = texNow("effects/fire_smoke.png");
      for (const [t, at] of this.smoke) {
        const k = (time - at) / 0.7;
        if (k >= 1 || now.has(t)) {
          this.smoke.delete(t);
          continue;
        }
        const [x, y] = t.split(",").map(Number);
        if (sm) d.sprite(`sm${t}`, frame(sm, Math.min(6, Math.floor(k * 7)) * 34, 0, 34, 34), (x + 0.5) * TILE, (y + 0.5) * TILE, { anchor: 0.5, rotation: this.upright, alpha: 1 - k * 0.5 });
        else d.gfx(`sm${t}`).circle((x + 0.5) * TILE, (y + 0.5) * TILE, 6 + 10 * k).fill({ color: 0xbbbbbb, alpha: 0.6 * (1 - k) });
      }
    }
    // Room system icons as FTL draws them (matched against real screenshots): the white overlay glyph
    // tinted grey whatever the power; red when destroyed, yellow-orange when damaged. An ionised one flashes
    // between blue and its usual colour.
    const ionBlink = Math.floor((o.clock ?? time) * 2) % 2 === 0;
    for (const s of Object.values(v.systems)) {
      if (!s) continue;
      const r = L.rooms.find((q) => q.id === s.room)!;
      const cx = (r.x + r.w / 2) * TILE;
      const cy = (r.y + r.h / 2) * TILE;
      const tint = s.ion > 0 && ionBlink ? 0x5aa8ff : s.damage >= s.level ? 0xff3c30 : s.damage > 0 ? 0xffa830 : 0x8a8a8a;
      const t = texNow(`icons/s_${baseSystemId(s.id)}_overlay.png`);
      if (t) d.sprite(`ic${s.id}`, t, cx, cy, { anchor: 0.5, scale: r.w * r.h <= 1 ? 0.8 : 1, rotation: up, tint });
      else {
        d.gfx(`icg${s.id}`).circle(cx, cy, 12).fill({ color: tint }).stroke({ color: 0xffffff, width: 2 });
        d.text(`ict${s.id}`, s.id.slice(0, 2).toUpperCase(), cx, cy, style(10, 0x000000, "700"), [0.5, 0.5], up);
      }
    }
    // Doors from FTL's door sheet: rows = door level, columns = opening frames.
    const doorTex = texNow("effects/door_sheet.png");
    // Door sprite row = door strength, as the sim reckons it: the doors system's working level (each
    // damaged bar takes one off, back down to plain doors), +1 while manned (level 4 = super doors).
    const dsys = v.systems.doors;
    const working = dsys ? usable(dsys) : 0;
    const level = Math.max(1, Math.min(4, working > 0 ? working + (dsys?.manBonus ?? 0) : 1));
    this.drawLockdowns(v, o.clock ?? time);
    // Doors under siege: the moment an enemy crew member's shot lands on one, it flashes dark red.
    const struck = new Set<number>();
    for (const cd of crew) {
      const c = cd.c;
      if (c.owner === v.idx || c.task !== "fight" || !c.aim || c.punch) continue;
      const ph = attackPhase(c, time);
      if (ph === null || ph < SHOT_AT + 0.18 || ph > SHOT_AT + 0.4) continue;
      const di = this.geo.doors.findIndex((dr) => Math.abs(dr.px / TILE - 0.5 - c.aim![0]) < 0.05 && Math.abs(dr.py / TILE - 0.5 - c.aim![1]) < 0.05);
      if (di >= 0) struck.add(di);
    }
    this.geo.doors.forEach((dr, i) => {
      // Open when set open, or held open for a moment (crew walking through, a broken door).
      const open = v.doors[i] || (v.doorPass?.[i] ?? 0) > 0;
      // Doors of a room locked by a hacking drone carry FTL's lock.
      const locked = v.lockedRoom !== undefined && (dr.roomA === v.lockedRoom || dr.roomB === v.lockedRoom);
      const now = o.clock ?? time;
      const a = (this.doorAnim[i] ??= { open, t: -9 });
      if (a.open !== open) {
        a.open = open;
        a.t = now;
      }
      const k = Math.min(1, (now - a.t) / 0.18);
      const f = Math.round((open ? k : 1 - k) * 4);
      const hot = o.hover.door === i;
      if (doorTex) {
        d.sprite(`door${i}`, frame(doorTex, f * 35, (level - 1) * 35, 35, 35), dr.px, dr.py, {
          anchor: 0.5, rotation: dr.vertical ? 0 : Math.PI / 2, tint: struck.has(i) ? 0x8a1a14 : hot ? 0xfff2a0 : 0xffffff,
        });
      } else {
        const gg = d.gfx(`doorg${i}`);
        const col = struck.has(i) ? 0x8a1a14 : hot ? 0xffe28a : 0xe08a2c;
        if (dr.vertical) gg.rect(dr.px - 3, dr.py - 15 + f * 3, 6, 30 - f * 6).fill({ color: col });
        else gg.rect(dr.px - 15 + f * 3, dr.py - 3, 30 - f * 6, 6).fill({ color: col });
      }
      if (locked && !open) d.sprite(`dlock${i}`, texNow("icons/locking/s_lock.png"), dr.px, dr.py, { anchor: 0.5, scale: 0.6, rotation: this.upright });
    });
    const facing = new Map<string, string>();
    for (const s of Object.values(v.systems)) if (s?.station && s.facing) facing.set(s.station, s.facing);
    // Stations whose system is ionised: whoever mans one freezes at the console until the ion wears off.
    const ionised = new Set(Object.values(v.systems).filter((s) => s?.station && s.ion > 0).map((s) => s!.station));
    const medRoom = v.systems.medbay && (v.systems.medbay.power + (v.systems.medbay.bonus ?? 0)) > 0 ? v.systems.medbay.room : -1;
    for (const cd of crew) this.drawCrew(cd, time, facing, medRoom, ionised);
    // Weapons on the hull; the battle decides the frame (charge lights, firing). Unpowered weapons slide
    // back into the hull along their mount's slide direction, like FTL.
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const wi = this.weaponsImm;
    wi.begin();
    if (L.img.w > 0 && this.hasArt()) {
      v.weapons.forEach((w, i) => {
        const m = L.mounts[i];
        const bp = this.db.weapons[w.bp];
        const anim = bp && this.db.weaponAnims[bp.weaponArt];
        if (!m || !bp || !anim) return;
        const f = weaponFrame(this.db, bp.weaponArt, o.weaponFrame?.(i) ?? 0);
        if (!f) return;
        const target = w.powered ? 0 : 1;
        const cur = (this.retract[i] ??= target);
        this.retract[i] = cur + Math.sign(target - cur) * Math.min(Math.abs(target - cur), dt * 2.5);
        const k = this.retract[i] * 14;
        const [sx, sy] = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0], "": [0, 0] }[m.slide ?? ""];
        const mx = L.img.x + m.x + sx * k;
        const my = L.img.y + m.y + sy * k;
        wi.sprite(`wp${i}`, f, mx, my, {
          anchor: [anim.mountPoint.x / f.width, anim.mountPoint.y / f.height], scale: [m.mirror ? -1 : 1, 1],
          rotation: m.rotate ? Math.PI / 2 : 0,
        });
        // Chain and charge weapons light up on the gun itself (FTL's <boost> glow): one more light per chain
        // boost, or per stored charge.
        const lit = w.charge < 0 ? 0 : bp.boost ? w.boost : bp.chargeLevels > 1 ? w.volleys : 0;
        const glowAnim = anim.boost ? this.db.anims[anim.boost] : undefined;
        const glow = glowAnim && lit > 0 ? animFrame(this.db, anim.boost!, Math.min(glowAnim.frames - 1, lit - 1)) : null;
        if (glow) {
          wi.sprite(`wb${i}`, glow, mx, my, {
            anchor: [anim.mountPoint.x / glow.width, anim.mountPoint.y / glow.height], scale: [m.mirror ? -1 : 1, 1],
            rotation: m.rotate ? Math.PI / 2 : 0,
          });
        }
        // Enemy weapons we can read (sensors 3, or a hacking drone on their weapons) get FTL's small yellow
        // charge bar beside the gun.
        if (this.enemy && (v.weaponsKnown || v.weaponChargeKnown) && w.charge >= 0) {
          const cdw = w.cd ?? bp.cooldown;
          const kk = w.volleys > 0 ? 1 : Math.min(1, w.charge / (cdw || 1));
          const bx = mx + (m.mirror ? 14 : -20);
          const by = my - 28;
          const g2 = d.gfx(`ec${i}`);
          g2.rect(bx, by, 6, 30).fill({ color: 0x101010, alpha: 0.8 }).stroke({ color: 0xfff0a0, width: 1 });
          const hgt = Math.floor(28 * kk / 2) * 2;
          g2.rect(bx + 1, by + 29 - hgt, 4, hgt).fill({ color: w.volleys > 0 ? 0xfff040 : 0xffc020 });
        }
      });
    }
    // Flagship artillery on its mounts.
    if (L.img.w > 0 && this.hasArt()) {
      this.artilleryIds(v).forEach((id, i) => {
        const s = v.systems[id as keyof typeof v.systems]!;
        const bp = this.db.weapons[s.weapon!];
        const anim = bp && this.db.weaponAnims[bp.weaponArt];
        const m = this.artilleryMount(i);
        this.lastArtillery[i] = s.weapon!;
        if (!m || !bp || !anim) return;
        const since = time - (this.artilleryFired[i] ?? -9);
        const cd = bp.cooldown || 1;
        const k = Math.min(1, (s.charge ?? 0) / cd);
        const fr = since >= 0 && since < 0.35 ? Math.min(anim.frames - 1, anim.chargedFrame + 1 + Math.floor((since / 0.35) * (anim.frames - anim.chargedFrame - 1))) : Math.floor(Math.min(0.999, k) * anim.chargedFrame);
        const f = weaponFrame(this.db, bp.weaponArt, fr);
        if (!f) return;
        wi.sprite(`ar${i}`, f, L.img.x + m.x, L.img.y + m.y, {
          anchor: [anim.mountPoint.x / f.width, anim.mountPoint.y / f.height], scale: [m.mirror ? -1 : 1, 1], rotation: m.rotate ? Math.PI / 2 : 0,
        });
      });
    }
    wi.end();
    // Engine glow at the nozzles while the engines have power.
    const th = this.thrusters;
    th.begin();
    const glow = texNow("effects/thrusters_on.png");
    if (glow && this.nozzles && (o.engines ?? 0) > 0) {
      const fr = Math.floor(time * 12) % 4;
      for (const [n, nz] of this.nozzles.entries()) {
        const sc = Math.max(0.5, Math.min(1.3, nz.h / 70));
        th.sprite(`t${n}`, frame(glow, fr * 22, 0, 22, 70), L.img.x + nz.x + 4, L.img.y + nz.y, {
          anchor: [1, 0.5], scale: sc, alpha: Math.min(1, 0.45 + 0.15 * (o.engines ?? 0)),
        });
      }
    }
    th.end();
    // Shields
    const flash = o.shieldFlash ?? 9;
    const sg = this.shieldG.clear();
    const c = this.gridCentre();
    const layers = v.shieldLayers;
    if (this.superArt) {
      this.superArt.visible = exploded === null && !o.exterior;
      const want = (v.superShield ?? 0) > 0 ? 0.55 + 0.08 * Math.sin(time * 3) : 0;
      this.superArt.alpha += (want - this.superArt.alpha) * 0.2;
    }
    if (this.shieldArt) this.shieldArt.alpha = layers > 0 ? Math.min(1, 0.3 + 0.17 * layers + Math.max(0, 0.5 - flash)) : Math.max(0, 0.6 - flash * 2);
    else if (layers > 0) {
      const b = this.bounds();
      sg.ellipse(c.x + L.ellipse.x, c.y + L.ellipse.y, b.w / 2 + 10, b.h / 2 + 10).fill({ color: 0x4aa8ff, alpha: 0.08 * layers }).stroke({ color: 0x6fc0ff, width: 2, alpha: 0.6 });
    }
    const fg = this.fog.clear();
    for (const r of L.rooms) {
      if (visible(r.id)) continue;
      // FTL draws unseen rooms as flat grey (sampled #373737 from the real game), not a see-through tint;
      // doors, room glyphs and sensed crew stay on top.
      fg.rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).fill({ color: 0x373737 });
    }
    // The room walls stay visible over the fog (black, as in FTL), so the layout reads with sensors out.
    for (const r of L.rooms) if (!visible(r.id)) fg.rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).stroke({ color: WALL, width: 3 });
    d.end();
  }

  /** When each sealed room's crystal formed, and when crystal that's gone started to shatter. */
  private lockSeen = new Map<number, number>();
  private lockGone = new Map<number, number>();

  /**
   * Crystal Lockdown: shards along the sealed room's walls, growing in (FTL's crystal_1, 6 frames, 0.5 s) and
   * held; when it ends they shatter (crystal_2, 5 frames).
   */
  private drawLockdowns(v: ShipView, now: number): void {
    const on = new Set((v.lockdowns ?? []).map((l) => l.room));
    for (const r of on) if (!this.lockSeen.has(r)) this.lockSeen.set(r, now);
    for (const [r] of this.lockSeen) {
      if (on.has(r)) continue;
      this.lockSeen.delete(r);
      this.lockGone.set(r, now);
    }
    const draw = (room: number, anim: string, fr: number) => {
      const r = this.layout.rooms.find((q) => q.id === room);
      const f = animFrame(this.db, anim, fr);
      if (!r) return;
      const x0 = r.x * TILE, y0 = r.y * TILE, x1 = (r.x + r.w) * TILE, y1 = (r.y + r.h) * TILE;
      const edges: [number, number, number, number, number][] = [
        [x0, y0, x1, y0, Math.PI], [x0, y1, x1, y1, 0], [x0, y0, x0, y1, Math.PI / 2], [x1, y0, x1, y1, -Math.PI / 2],
      ];
      edges.forEach(([ax, ay, bx, by, rot], e) => {
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.round(len / 17));
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n;
          const px = ax + (bx - ax) * k;
          const py = ay + (by - ay) * k;
          // Shards sit on the wall, pointing into the room.
          const ix = px + (rot === Math.PI / 2 ? 7 : rot === -Math.PI / 2 ? -7 : 0);
          const iy = py + (rot === Math.PI ? 7 : rot === 0 ? -7 : 0);
          if (f) this.dyn.sprite(`lk${room}_${e}_${i}`, f, ix, iy, { anchor: 0.5, rotation: rot + Math.PI });
          else this.dyn.gfx(`lkg${room}_${e}_${i}`).poly([ix - 5, iy + 4, ix, iy - 6, ix + 5, iy + 4]).fill({ color: 0x9fe8ff, alpha: 0.9 });
        }
      });
    };
    for (const [r, at] of this.lockSeen) draw(r, "crystal_1", Math.min(5, Math.floor(((now - at) / 0.5) * 6)));
    for (const [r, at] of this.lockGone) {
      const k = (now - at) / 0.45;
      if (k >= 1) {
        this.lockGone.delete(r);
        continue;
      }
      draw(r, "crystal_2", Math.min(4, Math.floor(k * 5)));
    }
  }

  private stripe(r: { id: number; x: number; y: number; w: number; h: number }, on: boolean): void {
    let s = this.stripes.get(r.id);
    if (!on) {
      if (s) s.visible = false;
      return;
    }
    // FTL has stripes cut for each room shape (1x2, 2x1, 2x2); bigger rooms tile the 2x2.
    const t = texNow(`effects/low_o2_stripes_${r.w}x${r.h}.png`) ?? texNow("effects/low_o2_stripes_2x2.png");
    if (!t) return;
    if (!s) {
      s = new TilingSprite({ texture: t, width: r.w * TILE, height: r.h * TILE });
      s.position.set(r.x * TILE, r.y * TILE);
      this.stripes.set(r.id, s);
      this.stripeRoot.addChild(s);
    }
    s.visible = true;
    // A light red: FTL's stripes over the low-air tint read too dark at full strength.
    s.alpha = 0.45;
  }

  private tileAnim(key: string, k: string, t: Texture | null, fallback: number, alpha: number): void {
    const [x, y] = k.split(",").map(Number);
    if (t) this.dyn.sprite(key, t, (x + 0.5) * TILE, (y + 0.5) * TILE, { anchor: 0.5, alpha, rotation: this.upright });
    else this.dyn.gfx(key).rect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8).fill({ color: fallback, alpha });
  }

  private drawCrew(cd: CrewDraw, time: number, facing: Map<string, string>, medRoom: number, ionised: Set<string> = new Set()): void {
    const { c } = cd;
    if (c.dead) return;
    const d = this.dyn;
    const px = (cd.x + 0.5) * TILE;
    const py = (cd.y + 0.5) * TILE;
    // The boarding drone has no sheet of its own: it uses the anti-personnel drone's.
    const sheet = c.race === "boarder" ? "battle" : c.race;
    const race = this.db.animSheets[sheet] ? sheet : "human";
    let anim = `${race}_walk_down`;
    let fr = 0;
    if (c.task === "walk" && c.path.length) {
      const [nx, ny] = c.path[0].split(",").map(Number);
      // Facing is chosen in screen space: rotate the grid direction by the container's rotation.
      let dx = nx - cd.x;
      let dy = ny - cd.y;
      const a = -this.upright;
      if (a) [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
      anim = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? `${race}_walk_right` : `${race}_walk_left`) : dy > 0 ? `${race}_walk_down` : `${race}_walk_up`;
      fr = Math.floor(time * 8);
    } else if (c.task === "repair" || c.task === "breach") {
      anim = `${race}_repair`;
      fr = Math.floor(time * 8);
    } else if (c.task === "fire") {
      // Half the speed of the other work animations, so extinguishing reads as steady spraying.
      anim = `${race}_fire_down`;
      fr = Math.floor(time * 5);
    } else if (c.task === "fight" || c.task === "sabotage") {
      // FTL: each swing picks its target and facing when it starts and keeps them, so poses don't flicker.
      // Sharing a tile means a punch (played once over the swing); otherwise the shoot pose's first frame
      // (FTL holds it), with a laser bolt crossing to the target as the hit lands. Wrecking a system and
      // breaking a door are shots too.
      const dir = this.screenDir(c.face ?? "up");
      const k = c.atk !== undefined && c.atkDur ? Math.max(0, Math.min(0.999, 1 - c.atk / c.atkDur)) : 0;
      if (c.punch && c.task === "fight") {
        // FTL's punches only face up or down.
        const pd = dir === "up" || dir === "left" ? "up" : "down";
        const pa = this.db.anims[`${race}_punch_${pd}`];
        anim = pa ? `${race}_punch_${pd}` : `${race}_shoot_${dir}`;
        fr = pa ? Math.floor(k * pa.frames) : 0;
      } else {
        anim = this.db.anims[`${race}_shoot_${dir}`] ? `${race}_shoot_${dir}` : `${race}_shoot_right`;
        // A shot each swing: the gun's firing frames as the bolt leaves, aimed at the foe, the door, or (when
        // wrecking a system) the console in front of them, with a spark where it lands.
        const ph = attackPhase(c, time) ?? 0;
        const frames = this.db.anims[anim]?.frames ?? 1;
        fr = ph >= SHOT_AT && ph < SHOT_AT + 0.3 ? Math.min(frames - 1, 1 + Math.floor(((ph - SHOT_AT) / 0.3) * (frames - 1))) : 0;
        const f = c.face ?? "up";
        const [fx, fy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[f];
        // Wrecking a system: shots go into the middle of the room (the system itself).
        const sr = c.task === "sabotage" ? this.layout.rooms.find((r) => r.id === this.geo.tiles.get(c.tile)?.room) : undefined;
        const aim: [number, number] | undefined = sr ? [sr.x + sr.w / 2 - 0.5, sr.y + sr.h / 2 - 0.5] : c.task === "sabotage" ? [cd.x + fx * 0.55, cd.y + fy * 0.55] : c.aim;
        if (aim && ph >= SHOT_AT && ph < SHOT_AT + 0.25) {
          const tx = (aim[0] + 0.5) * TILE;
          const ty = (aim[1] + 0.5) * TILE;
          const kk = (ph - SHOT_AT) / 0.25;
          const bx = px + (tx - px) * kk;
          const by = py + (ty - py) * kk;
          const len = Math.hypot(tx - px, ty - py) || 1;
          const ux = (tx - px) / len;
          const uy = (ty - py) / len;
          const col = cd.hostile ? 0xff5040 : 0xffd040;
          d.gfx(`cr${c.id}bolt`).moveTo(bx - ux * 5, by - uy * 5).lineTo(bx + ux * 5, by + uy * 5).stroke({ color: col, width: 2 });
          if (kk > 0.75) d.gfx(`cr${c.id}spark`).circle(tx, ty, 2 + 4 * (kk - 0.75) * 4).fill({ color: 0xfff0a0, alpha: 0.9 });
        }
      }
    } else if (c.task === "man") {
      // Face the station's computer (the blueprint's slot <direction>).
      anim = `${race}_type_${facing.get(c.tile) ?? "up"}`;
      fr = ionised.has(c.tile) ? 0 : Math.floor(time * 6);
    }
    // A drone unit whose drone lost power slumps into its power-down pose until it's switched back on.
    if (c.drone !== undefined && cd.offline) {
      const a = this.db.anims[`${race}_power_down`];
      if (a) {
        anim = `${race}_power_down`;
        fr = a.frames - 1;
      }
    }
    // Fresh from the clone bay: FTL's <race>_clone animation.
    if (c.spawn !== undefined && this.db.anims[`${race}_clone`]) {
      const a = this.db.anims[`${race}_clone`];
      anim = `${race}_clone`;
      fr = Math.min(a.frames - 1, Math.floor((1 - c.spawn / RULES.cloneSpawn) * a.frames));
    }
    if (c.beam && this.db.anims[`${race}_teleport`]) {
      // FTL's teleport animation: forward on the way out, reversed on arrival.
      const a = this.db.anims[`${race}_teleport`];
      const k = Math.max(0, Math.min(0.999, 1 - c.beam.t / RULES.teleportTime));
      const i = Math.floor(k * a.frames);
      anim = `${race}_teleport`;
      fr = c.beam.phase === "out" ? i : a.frames - 1 - i;
    }
    if (c.dying !== undefined) {
      // Death animation, played once over the dying time.
      anim = `${race}_death_right`;
      const a = this.db.anims[anim];
      fr = Math.min((a?.frames ?? 5) - 1, Math.floor((1 - c.dying / 0.9) * (a?.frames ?? 5)));
    }
    const t = animFrame(this.db, anim, fr) ?? animFrame(this.db, `${race}_walk_down`, 0);
    const key = `cr${c.id}`;
    const rot = this.upright;
    if (c.blip && c.sense === "dot") {
      // Sensed as a dot (RULES.senseStyle): a pulsing marker, no race or action.
      const pulse = 0.65 + 0.35 * Math.sin(time * 4 + c.id);
      d.gfx(`${key}blip`).circle(px, py, 8).fill({ color: 0xff7aa0, alpha: 0.25 * pulse }).circle(px, py, 4.5).fill({ color: 0xffb0c8, alpha: pulse });
      return;
    }
    if (c.blip) {
      // Sensed by telepathy (a Slug, the Lifeform Scanner): FTL's silhouette of the crew member, moving as they
      // do, in a pulsing glow; no name or health.
      const sil = animFrame(this.db, anim, fr, `people/${race}_color.png`) ?? t;
      const pulse = 0.7 + 0.3 * Math.sin(time * 4 + c.id);
      if (sil) d.sprite(`${key}blip`, sil, px, py, { anchor: 0.5, rotation: rot, tint: 0xff7a8a, alpha: 0.85 * pulse });
      else d.gfx(`${key}blip`).circle(px, py, 6).fill({ color: 0xff7a8a, alpha: pulse });
      return;
    }
    if (t) {
      // FTL's <race>_color sheet is the crew silhouette: drawn green behind a selected crew member.
      if (cd.selected) {
        const sil = animFrame(this.db, anim, fr, `people/${race}_color.png`) ?? t;
        d.sprite(`${key}sel`, sil, px, py, { anchor: 0.5, rotation: rot, tint: 0x30ff30, scale: 1.14 });
      }
      // Hostile crew get FTL's red cast; drone units keep their own colours.
      d.sprite(key, t, px, py, { anchor: 0.5, rotation: rot, tint: c.mind ? 0xd8a0ff : cd.hostile && c.drone === undefined ? 0xffb0a8 : 0xffffff });
      // A red underline under hostile crew, on screen (the enemy view is rotated: draw it along the grid's y).
      if (cd.hostile) {
        if (!rot) d.gfx(`${key}foe`).rect(px - 12, py + 12, 24, 2).fill({ color: 0xff4a3a, alpha: 0.9 });
        else d.gfx(`${key}foe`).rect(px - 14, py - 12, 2, 24).fill({ color: 0xff4a3a, alpha: 0.9 });
      }
    } else {
      d.gfx(key).circle(px, py, 9).fill({ color: cd.hostile ? 0xe05555 : 0x5fa8ff }).stroke({ color: cd.selected ? 0x30ff30 : 0x000000, width: 2 });
    }
    // Health box (shown when hurt or selected), kept above the sprite on screen.
    if (c.dying === undefined && (cd.selected || c.hp < c.maxHp)) {
      const hp = Math.max(0, c.hp / c.maxHp);
      const col = hp > 0.5 ? 0x5fdc5f : hp > 0.25 ? 0xf0c030 : 0xff4040;
      const gx = d.gfx(`${key}h`);
      if (!rot) {
        // The box turns red at the same point the low-health warning beeps.
        const hb = texNow(hp < LOW_HP ? "people/health_box_red.png" : "people/health_box.png");
        if (hb) d.sprite(`${key}hb`, hb, px, py - 21, { anchor: 0.5 });
        gx.rect(px - 13, py - 23, 26 * hp, 4).fill({ color: col });
      } else gx.rect(px + 17, py - 13, 4, 26 * hp).fill({ color: col });
    }
    // Stunned: FTL's spinning stars over their head (people/stun_strip5: five 14 px frames).
    if (c.stun > 0) {
      const st = texNow("people/stun_strip5.png");
      if (st) d.sprite(`${key}s`, frame(st, (Math.floor(time * 10) % 5) * 14, 0, 14, 14), px, py - 22, { anchor: 0.5, rotation: this.upright });
      else d.gfx(`${key}s`).circle(px, py - 14, 4).fill({ color: 0x9fd0ff });
    }
    // Mind controlled: FTL's spinning swirl over their head, and a purple cast.
    if (c.mind) {
      const sw = texNow("people/mindcontrol_strip8.png");
      if (sw) d.sprite(`${key}mc`, frame(sw, (Math.floor(time * 10) % 8) * 14, 0, 14, 14), px, py - 22, { anchor: 0.5, rotation: this.upright });
    }
    // Healing crosses while the medbay heals this crew member.
    const heal = texNow("people/healing_strip11.png");
    const tileRoom = this.geo.tiles.get(c.tile)?.room;
    if (heal && c.dying === undefined && c.healing && c.hp < c.maxHp) {
      d.sprite(`${key}heal`, frame(heal, (Math.floor(time * 12) % 11) * 32, 0, 32, 32), px, py - 4, { anchor: 0.5, rotation: this.upright });
    }
  }

  /** A grid-space facing turned into the screen-space one (the enemy view may be rotated). */
  private screenDir(f: "up" | "down" | "left" | "right"): "up" | "down" | "left" | "right" {
    let [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[f];
    const a = -this.upright;
    if (a) [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }

  /** The hull's gibs flying apart `t` s after it broke; `some`: only the first half of them (pieces shed). */
  private drawGibs(t: number, some = false): void {
    const bp = this.db.ships[this.shipId];
    const L = this.layout;
    this.gibRoot.visible = true;
    const gi = this.gibs;
    gi.begin();
    // Deterministic pick within each gib's ranges.
    const rnd = (seed: number, [a, b]: [number, number]) => a + (b - a) * ((Math.abs(Math.sin(seed * 12.9898) * 43758.5453)) % 1);
    const fade = Math.max(0, Math.min(1, 1 - (t - 4) / 2));
    if (L.gibs.length && this.hasArt()) {
      for (const gb of L.gibs) {
        if (some && gb.n > Math.max(1, Math.floor(L.gibs.length / 2))) continue;
        const tex = texNow(this.art(`gib${gb.n}`));
        if (!tex) continue;
        // FTL units (read from the layout): velocity ≈ px/frame, direction in degrees (0 = right,
        // clockwise), angular ≈ rad/s. Pieces start where they sit on the intact hull.
        const vel = rnd(gb.n, gb.velocity) * 20;
        const dir = (rnd(gb.n + 7, gb.direction) * Math.PI) / 180;
        const ang = rnd(gb.n + 13, gb.angular);
        const cx = L.img.x + gb.x + tex.width / 2 + Math.cos(dir) * vel * t;
        const cy = L.img.y + gb.y + tex.height / 2 + Math.sin(dir) * vel * t;
        gi.sprite(`g${gb.n}`, tex, cx, cy, { anchor: 0.5, rotation: ang * t, alpha: fade });
      }
    } else {
      const b = this.bounds();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const gg = gi.gfx(`fg${i}`).rect(-30, -20, 60, 40).fill({ color: 0x4b5262, alpha: fade }).stroke({ color: 0x8892a6, width: 2, alpha: fade });
        gg.position.set(b.x + b.w / 2 + Math.cos(a) * 25 * t, b.y + b.h / 2 + Math.sin(a) * 25 * t);
        gg.rotation = a * t * 0.2;
      }
    }
    gi.end();
  }

  /**
   * The Rebel flagship's guns are artillery systems: artillery N stands on weapon mount N and draws its weapon's
   * art there (charging frames, then the fire frames when it shoots).
   */
  /** Artillery gun i's mount: after the weapon system's slots (the flagship's guns sit on mounts 4-7). */
  private artilleryMount(i: number) {
    const L = this.layout;
    const slots = this.db.ships[this.shipId]?.weaponSlots ?? 4;
    return L.mounts[slots + i] ?? L.mounts[i];
  }

  private artilleryIds(v: ShipView): string[] {
    return ["artillery", "artillery2", "artillery3", "artillery4"].filter((id) => v.systems[id as keyof typeof v.systems]?.weapon);
  }

  artilleryMuzzle(i: number): { x: number; y: number } {
    const L = this.layout;
    const m = this.artilleryMount(i);
    if (!m || !this.hasArt()) return this.gridCentre();
    const id = this.lastArtillery[i];
    const anim = id ? this.db.weaponAnims[this.db.weapons[id]?.weaponArt ?? ""] : undefined;
    const base = { x: L.img.x + m.x, y: L.img.y + m.y };
    if (!anim) return base;
    let dx = anim.firePoint.x - anim.mountPoint.x;
    let dy = anim.firePoint.y - anim.mountPoint.y;
    if (m.mirror) dx = -dx;
    if (m.rotate) [dx, dy] = [-dy, dx];
    return { x: base.x + dx, y: base.y + dy };
  }

  private lastArtillery: string[] = [];
  /** When each artillery gun last fired (renderer time), for its fire frames. */
  artilleryFired: number[] = [];

  /** The shield bubble in grid pixels: centre and radii (the art when loaded, else the hull's box). */
  shieldEllipse(): { x: number; y: number; a: number; b: number } {
    const s = this.shieldArt;
    if (s) return { x: s.position.x, y: s.position.y, a: Math.abs(s.width) / 2, b: Math.abs(s.height) / 2 };
    const b = this.bounds();
    return { x: b.x + b.w / 2, y: b.y + b.h / 2, a: b.w / 2 + 10, b: b.h / 2 + 10 };
  }

  mountPoint(i: number): { x: number; y: number } {
    const L = this.layout;
    const m = L.mounts[i];
    if (m && L.img.w > 0 && this.hasArt()) return { x: L.img.x + m.x, y: L.img.y + m.y };
    const c = this.gridCentre();
    return { x: c.x + 80, y: c.y + (i % 2 ? 40 : -40) };
  }

  /** Where shots leave weapon i: the mount plus the art's firePoint offset, transformed like the sprite. */
  muzzlePoint(i: number, bpId: string): { x: number; y: number } {
    const base = this.mountPoint(i);
    const bp = this.db.weapons[bpId];
    const anim = bp && this.db.weaponAnims[bp.weaponArt];
    const m = this.layout.mounts[i];
    if (!anim || !m || !this.hasArt()) return base;
    let dx = anim.firePoint.x - anim.mountPoint.x;
    let dy = anim.firePoint.y - anim.mountPoint.y;
    if (m.mirror) dx = -dx;
    if (m.rotate) [dx, dy] = [-dy, dx];
    return { x: base.x + dx, y: base.y + dy };
  }

  pick(px: number, py: number): { room: number; door: number } {
    let door = -1;
    let best = 9;
    for (const d of this.geo.doors) {
      const dist = Math.hypot(d.px - px, d.py - py);
      if (dist < best) {
        best = dist;
        door = d.index;
      }
    }
    const t = this.geo.tiles.get(`${Math.floor(px / TILE)},${Math.floor(py / TILE)}`);
    return { room: t ? t.room : -1, door };
  }
}

/**
 * Engine nozzles of a right-facing hull: FTL hard-codes thruster spots per ship, so find them in the art.
 * Rows whose leftmost opaque pixel is within a few px of the hull's left edge form pods; each pod gets
 * one glow centred on it.
 */
function findNozzles(tex: Texture): { x: number; y: number; h: number }[] {
  try {
    const src = tex.source.resource as CanvasImageSource & { width: number; height: number };
    const cv = document.createElement("canvas");
    cv.width = src.width;
    cv.height = src.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
    const left: number[] = [];
    for (let y = 0; y < height; y++) {
      let x = 0;
      while (x < width && data[(y * width + x) * 4 + 3] < 200) x++;
      left.push(x);
    }
    // Nozzle banks are flat vertical stretches of the rear edge, 30-95 px tall (a whole flat stern, like
    // the Kestrel's centre section, is taller and skipped), in the rear third of the hull.
    const runs: { y0: number; y1: number; x: number }[] = [];
    for (let y = 1; y < height; y++) {
      if (left[y] >= width) continue;
      const last = runs[runs.length - 1];
      if (last && y - last.y1 === 1 && Math.abs(left[y] - left[last.y1]) <= 2) {
        last.y1 = y;
        last.x = Math.min(last.x, left[y]);
      } else runs.push({ y0: y, y1: y, x: left[y] });
    }
    return runs
      .filter((r) => r.y1 - r.y0 >= 30 && r.y1 - r.y0 <= 95 && r.x < width / 3)
      .map((r) => ({ x: r.x, y: (r.y0 + r.y1) / 2, h: r.y1 - r.y0 }));
  } catch {
    return [];
  }
}
