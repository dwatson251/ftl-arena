/**
 * Draws one ship. The container's origin is the room grid's top-left (tile 0,0) in grid pixels, so sim
 * coordinates map 1:1. Hull art sits at the layout's <img> offset, the floor at <img> + <floor>, weapon
 * mounts relative to the hull image. `upright` is the rotation that cancels the container's own rotation
 * (the enemy ship is drawn rotated to stand vertically), so icons and crew stay upright on screen.
 * Falls back to flat shapes without extracted art.
 */
import { Container, Graphics, Sprite, TilingSprite, type Texture } from "pixi.js";
import { baseSystemId, type GameDB, type ShipLayout } from "@ftl/data";
import { geometry, RULES, TILE, type CrewState, type Geometry, type ShipView } from "@ftl/sim";
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
}

export interface ShipDrawOpts {
  hover: { room: number; door: number };
  /** Weapon art frame per slot (charging lights / firing). */
  weaponFrame?: (slot: number) => number | undefined;
  /** Seconds since the last shield hit (bubble flash). */
  shieldFlash?: number;
  /** Seconds since the hull broke apart, or null. */
  exploded?: number | null;
  /** Show green destination tiles for walking crew (own ship). */
  destinations?: boolean;
  /** Recently ordered destination tiles: tile key -> seconds left. */
  flashTiles?: Map<string, number>;
  /** Engines' effective power (thruster glow). */
  engines?: number;
  /** Cloaked: the ship fades into FTL's translucent cloak look. */
  cloaked?: boolean;
}

export class ShipRenderer {
  root = new Container();
  private hull = new Container();
  private floorG = new Graphics();
  private interior = new Container();
  private dynRoot = new Container();
  private dyn: Imm;
  private fog = new Graphics();
  private gibRoot = new Container();
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
  private shieldG = new Graphics();
  readonly geo: Geometry;
  readonly layout: ShipLayout;
  private built = false;
  private doorAnim: { open: boolean; t: number }[] = [];
  private stripes = new Map<number, TilingSprite>();
  private stripeRoot = new Container();

  constructor(public db: GameDB, public shipId: string, public enemy: boolean, public upright = 0) {
    const bp = db.ships[shipId];
    this.layout = db.layouts[bp.layout];
    this.geo = geometry(this.layout);
    this.dyn = new Imm(this.dynRoot);
    this.gibs = new Imm(this.gibRoot);
    this.marks = new Imm(this.marksRoot);
    this.thrusters = new Imm(this.thrusterRoot);
    this.weaponsImm = new Imm(this.weaponRoot);
    this.root.addChild(this.shieldG, this.thrusterRoot, this.weaponRoot, this.hull, this.floorG, this.interior, this.stripeRoot, this.fog, this.dynRoot, this.overlay, this.marksRoot, this.gibRoot);
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
    this.interior.removeChildren();
    const base = texNow(this.art("base"));
    const floor = bp.enemy ? null : texNow(this.art("floor"));
    if (base) {
      const s = new Sprite(base);
      s.position.set(L.img.x, L.img.y);
      this.hull.addChild(s);
      if (floor) {
        const f = new Sprite(floor);
        f.position.set(L.img.x + L.floor.x, L.img.y + L.floor.y);
        this.hull.addChild(f);
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
    // Interiors for the systems actually installed (a bought clone bay replaces the medbay art).
    for (const s of bp.systems) {
      const installed = v ? !!v.systems[s.id] : s.start;
      const r = L.rooms.find((q) => q.id === s.room);
      if (!installed || !r) continue;
      if (s.id === "clonebay") {
        for (const part of ["clone_bottom", "clone_top"]) {
          const t = texNow(`ship/interior/${part}.png`);
          if (!t) continue;
          const sp = new Sprite(t);
          sp.position.set(r.x * TILE, r.y * TILE);
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
    const sh = texNow(bp.enemy ? "ship/enemy_shields.png" : shieldFile(bp.img));
    const c = this.gridCentre();
    if (sh && !this.shieldArt) {
      this.shieldArt = new Sprite(sh);
      this.shieldArt.anchor.set(0.5);
      this.shieldArt.position.set(c.x + L.ellipse.x, c.y + L.ellipse.y);
      // Enemy layouts' ellipse offsets are for FTL's own window placement; centre on the hull instead.
      if (bp.enemy) this.shieldArt.position.set(L.img.x + L.img.w / 2, L.img.y + L.img.h / 2);
      if (bp.enemy && L.ellipse.a > 0) {
        this.shieldArt.width = L.ellipse.a * 2;
        this.shieldArt.height = L.ellipse.b * 2;
      }
      this.root.addChildAt(this.shieldArt, 0);
    }
    if (base && !bp.enemy) this.nozzles = findNozzles(base);
    this.built = Boolean(base) || this.db.source !== "ftl";
  }

  update(v: ShipView, crew: CrewDraw[], time: number, o: ShipDrawOpts): void {
    if (!this.built) this.buildStatic(v);
    const L = this.layout;
    const up = this.upright;
    const d = this.dyn;
    const exploded = o.exploded ?? null;
    for (const n of [this.hull, this.floorG, this.interior, this.dynRoot, this.fog, this.stripeRoot, this.weaponRoot, this.thrusterRoot]) n.visible = exploded === null;
    // Cloaking: fade toward FTL's half-there look (eased so it doesn't pop).
    const want = o.cloaked ? 0.4 : 1;
    this.root.alpha += (want - this.root.alpha) * 0.15;
    if (this.shieldArt) this.shieldArt.visible = exploded === null;
    if (exploded !== null) {
      this.drawGibs(exploded);
      return;
    }
    this.gibRoot.visible = false;
    d.begin();
    // A room is seen when the server listed it (boarders, no-sensor rooms with own crew), else by sensors.
    const visible = (room: number) => (v.visibleRooms ? v.visibleRooms.includes(room) : v.interior);
    const g = d.gfx("rooms");
    // Low O2: pink tint, plus FTL's warning stripes when it's nearly gone.
    for (const rs of v.rooms) {
      const r = L.rooms.find((q) => q.id === rs.id)!;
      const known = rs.o2 >= 0 && visible(rs.id);
      if (known && rs.o2 < 66) g.rect(r.x * TILE + 2, r.y * TILE + 2, r.w * TILE - 4, r.h * TILE - 4).fill({ color: 0xff3b6b, alpha: ((66 - rs.o2) / 66) * 0.42 });
      this.stripe(r, known && rs.o2 < 25);
    }
    if (o.hover.room >= 0) {
      const r = L.rooms.find((q) => q.id === o.hover.room);
      if (r) g.rect(r.x * TILE + 2, r.y * TILE + 2, r.w * TILE - 4, r.h * TILE - 4).stroke({ color: this.enemy ? 0xff5555 : 0x7bd47b, width: 3 });
    }
    // Destination tiles: FTL lights the tile a crew member is walking to.
    if (o.destinations) {
      const dest = texNow("people/green_destination.png");
      const tiles = new Set<string>();
      for (const cd of crew) if (!cd.c.dead && cd.c.path.length) tiles.add(cd.c.home);
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
      d.sprite("cgas", gas, r.x * TILE, r.y * TILE, { alpha: 0.5 + 0.3 * Math.sin(time * 4) });
    }
    // Hazards
    {
      for (const rs of v.rooms) {
        if (!visible(rs.id)) continue;
        // A breach is a state, not a loop: the crack shrinks back through its frames as it's repaired.
        for (const [t, hp] of Object.entries(rs.breaches)) this.tileAnim(`br${t}`, t, animFrame(this.db, "breach", Math.max(0, Math.min(6, Math.ceil((hp / 100) * 7) - 1))), 0x2a2a2a, 1);
        for (const t of Object.keys(rs.fires)) this.tileAnim(`fi${t}`, t, animFrame(this.db, "fire_large", Math.floor(time * 10 + t.length)), 0xff7a1a, 0.9);
      }
    }
    // Room system icons as FTL draws them (matched against real screenshots): the white overlay glyph
    // tinted grey whatever the power; blue when ionised, yellow-orange when damaged, red when destroyed.
    for (const s of Object.values(v.systems)) {
      if (!s) continue;
      const r = L.rooms.find((q) => q.id === s.room)!;
      const cx = (r.x + r.w / 2) * TILE;
      const cy = (r.y + r.h / 2) * TILE;
      const tint = s.damage >= s.level ? 0xff3c30 : s.damage > 0 ? 0xffa830 : s.ion > 0 ? 0x5aa8ff : 0x8a8a8a;
      const t = texNow(`icons/s_${baseSystemId(s.id)}_overlay.png`);
      if (t) d.sprite(`ic${s.id}`, t, cx, cy, { anchor: 0.5, scale: r.w * r.h <= 1 ? 0.8 : 1, rotation: up, tint });
      else {
        d.gfx(`icg${s.id}`).circle(cx, cy, 12).fill({ color: tint }).stroke({ color: 0xffffff, width: 2 });
        d.text(`ict${s.id}`, s.id.slice(0, 2).toUpperCase(), cx, cy, style(10, 0x000000, "700"), [0.5, 0.5], up);
      }
    }
    // Doors from FTL's door sheet: rows = door level, columns = opening frames.
    const doorTex = texNow("effects/door_sheet.png");
    // Door sprite row = door strength: the doors level, +1 while manned (level 4 = super doors).
    const dsys = v.systems.doors;
    const level = Math.max(1, Math.min(4, (dsys?.level ?? 1) + (dsys?.manBonus ?? 0)));
    this.geo.doors.forEach((dr, i) => {
      // Open when set open, or held open for a moment (crew walking through, a broken door).
      const open = v.doors[i] || (v.doorPass?.[i] ?? 0) > 0;
      // Doors of a room locked by a hacking drone carry FTL's lock.
      const locked = v.lockedRoom !== undefined && (dr.roomA === v.lockedRoom || dr.roomB === v.lockedRoom);
      const a = (this.doorAnim[i] ??= { open, t: -9 });
      if (a.open !== open) {
        a.open = open;
        a.t = time;
      }
      const k = Math.min(1, (time - a.t) / 0.18);
      const f = Math.round((open ? k : 1 - k) * 4);
      const hot = o.hover.door === i;
      if (doorTex) {
        d.sprite(`door${i}`, frame(doorTex, f * 35, (level - 1) * 35, 35, 35), dr.px, dr.py, {
          anchor: 0.5, rotation: dr.vertical ? 0 : Math.PI / 2, tint: hot ? 0xfff2a0 : 0xffffff,
        });
      } else {
        const gg = d.gfx(`doorg${i}`);
        const col = hot ? 0xffe28a : 0xe08a2c;
        if (dr.vertical) gg.rect(dr.px - 3, dr.py - 15 + f * 3, 6, 30 - f * 6).fill({ color: col });
        else gg.rect(dr.px - 15 + f * 3, dr.py - 3, 30 - f * 6, 6).fill({ color: col });
      }
      if (locked && !open) d.sprite(`dlock${i}`, texNow("icons/locking/s_lock.png"), dr.px, dr.py, { anchor: 0.5, scale: 0.6, rotation: this.upright });
    });
    const facing = new Map<string, string>();
    for (const s of Object.values(v.systems)) if (s?.station && s.facing) facing.set(s.station, s.facing);
    const medRoom = v.systems.medbay && (v.systems.medbay.power + (v.systems.medbay.bonus ?? 0)) > 0 ? v.systems.medbay.room : -1;
    for (const cd of crew) this.drawCrew(cd, time, facing, medRoom);
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
        const target = w.powered || w.charge < 0 ? 0 : 1;
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
        // Enemy weapons we can read (sensors 3) get FTL's small yellow charge bar beside the gun.
        if (this.enemy && v.weaponsKnown && w.charge >= 0) {
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
    d.end();
  }

  private stripe(r: { id: number; x: number; y: number; w: number; h: number }, on: boolean): void {
    let s = this.stripes.get(r.id);
    if (!on) {
      if (s) s.visible = false;
      return;
    }
    const t = texNow("effects/low_o2_stripes_2x2.png");
    if (!t) return;
    if (!s) {
      s = new TilingSprite({ texture: t, width: r.w * TILE, height: r.h * TILE });
      s.position.set(r.x * TILE, r.y * TILE);
      this.stripes.set(r.id, s);
      this.stripeRoot.addChild(s);
    }
    s.visible = true;
    s.alpha = 0.7;
  }

  private tileAnim(key: string, k: string, t: Texture | null, fallback: number, alpha: number): void {
    const [x, y] = k.split(",").map(Number);
    if (t) this.dyn.sprite(key, t, (x + 0.5) * TILE, (y + 0.5) * TILE, { anchor: 0.5, alpha, rotation: this.upright });
    else this.dyn.gfx(key).rect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8).fill({ color: fallback, alpha });
  }

  private drawCrew(cd: CrewDraw, time: number, facing: Map<string, string>, medRoom: number): void {
    const { c } = cd;
    if (c.dead) return;
    const d = this.dyn;
    const px = (cd.x + 0.5) * TILE;
    const py = (cd.y + 0.5) * TILE;
    if (c.blip) {
      // Telepathic sense: a pulsing dot, no race or action.
      const pulse = 0.65 + 0.35 * Math.sin(time * 4 + c.id);
      d.gfx(`blip${c.id}`).circle(px, py, 8).fill({ color: 0xff7aa0, alpha: 0.25 * pulse }).circle(px, py, 4.5).fill({ color: 0xffb0c8, alpha: pulse });
      return;
    }
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
      // FTL: crew carry guns. A target on another tile (or a door being broken) gets shot; one sharing the
      // tile gets punched. Wrecking a system is up-close work.
      const aim = c.aim;
      const far = !!aim && c.task === "fight" && Math.hypot(aim[0] - cd.x, aim[1] - cd.y) > 0.6;
      if (far && aim) {
        let dx = aim[0] - cd.x;
        let dy = aim[1] - cd.y;
        const a = -this.upright;
        if (a) [dx, dy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        anim = this.db.anims[`${race}_shoot_${dir}`] ? `${race}_shoot_${dir}` : `${race}_shoot_right`;
        fr = Math.floor(time * 6);
        // A laser bolt every so often, from the gun toward the target.
        const ph = (time * 1.6 + c.id * 0.37) % 1;
        if (ph < 0.25) {
          const tx = (aim[0] + 0.5) * TILE;
          const ty = (aim[1] + 0.5) * TILE;
          const k = ph / 0.25;
          const bx = px + (tx - px) * k;
          const by = py + (ty - py) * k;
          const ux = (tx - px) / (Math.hypot(tx - px, ty - py) || 1);
          const uy = (ty - py) / (Math.hypot(tx - px, ty - py) || 1);
          d.gfx(`cr${c.id}bolt`).moveTo(bx - ux * 6, by - uy * 6).lineTo(bx + ux * 6, by + uy * 6).stroke({ color: cd.hostile ? 0xff5040 : 0xffd040, width: 2 });
        }
      } else {
        const punch = this.db.anims[`${race}_punch_up`];
        anim = punch ? (Math.floor(time * 2 + c.id) % 2 ? `${race}_punch_up` : `${race}_punch_down`) : this.db.anims[`${race}_attack`] ? `${race}_attack` : `${race}_shoot_right`;
        fr = Math.floor(time * 8);
      }
    } else if (c.task === "man") {
      // Face the station's computer (the blueprint's slot <direction>).
      anim = `${race}_type_${facing.get(c.tile) ?? "up"}`;
      fr = Math.floor(time * 6);
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
    if (t) {
      // FTL's <race>_color sheet is the crew silhouette: drawn green behind a selected crew member.
      if (cd.selected) {
        const sil = animFrame(this.db, anim, fr, `people/${race}_color.png`) ?? t;
        d.sprite(`${key}sel`, sil, px, py, { anchor: 0.5, rotation: rot, tint: 0x30ff30, scale: 1.14 });
      }
      // Hostile crew get FTL's red cast; drone units keep their own colours.
      d.sprite(key, t, px, py, { anchor: 0.5, rotation: rot, tint: c.mind ? 0xd8a0ff : cd.hostile && c.drone === undefined ? 0xffb0a8 : 0xffffff });
      if (cd.hostile) d.gfx(`${key}foe`).rect(px - 12, py + 12, 24, 2).fill({ color: 0xff4a3a, alpha: 0.9 });
    } else {
      d.gfx(key).circle(px, py, 9).fill({ color: cd.hostile ? 0xe05555 : 0x5fa8ff }).stroke({ color: cd.selected ? 0x30ff30 : 0x000000, width: 2 });
    }
    // Health box (shown when hurt or selected), kept above the sprite on screen.
    if (c.dying === undefined && (cd.selected || c.hp < c.maxHp)) {
      const hp = Math.max(0, c.hp / c.maxHp);
      const col = hp > 0.5 ? 0x5fdc5f : hp > 0.25 ? 0xf0c030 : 0xff4040;
      const gx = d.gfx(`${key}h`);
      if (!rot) {
        const hb = texNow(hp < 0.35 ? "people/health_box_red.png" : "people/health_box.png");
        if (hb) d.sprite(`${key}hb`, hb, px, py - 21, { anchor: 0.5 });
        gx.rect(px - 13, py - 23, 26 * hp, 4).fill({ color: col });
      } else gx.rect(px + 17, py - 13, 4, 26 * hp).fill({ color: col });
    }
    if (c.stun > 0) d.gfx(`${key}s`).circle(px, py - 14, 4).fill({ color: 0x9fd0ff });
    // Mind controlled: FTL's spinning swirl over their head, and a purple cast.
    if (c.mind) {
      const sw = texNow("people/mindcontrol_strip8.png");
      if (sw) d.sprite(`${key}mc`, frame(sw, (Math.floor(time * 10) % 8) * 14, 0, 14, 14), px, py - 22, { anchor: 0.5, rotation: this.upright });
    }
    // Healing crosses while the medbay heals this crew member.
    const heal = texNow("people/healing_strip11.png");
    const tileRoom = this.geo.tiles.get(c.tile)?.room;
    if (heal && c.dying === undefined && tileRoom === medRoom && c.hp < c.maxHp && c.path.length === 0) {
      d.sprite(`${key}heal`, frame(heal, (Math.floor(time * 12) % 11) * 32, 0, 32, 32), px, py - 4, { anchor: 0.5, rotation: this.upright });
    }
  }

  private drawGibs(t: number): void {
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
