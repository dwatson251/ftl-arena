/**
 * Draws one ship. The container's origin is the room grid's top-left (tile 0,0) in grid pixels, so sim
 * coordinates map 1:1. Hull art sits at the layout's <img> offset, the floor at <img> + <floor>, weapon
 * mounts relative to the hull image. `upright` is the rotation that cancels the container's own rotation
 * (the enemy ship is drawn rotated to stand vertically), so icons and crew stay upright on screen.
 * Falls back to flat shapes without extracted art.
 */
import { Container, Graphics, Sprite, TilingSprite, type Texture } from "pixi.js";
import type { GameDB, ShipLayout } from "@ftl/data";
import { geometry, TILE, type CrewState, type Geometry, type ShipView } from "@ftl/sim";
import { animFrame, frame, texNow, weaponFrame } from "../assets.ts";
import { Imm, style } from "../imm.ts";

const FLOOR = 0xe6e2db;
const GRID = 0xb9b4aa;
const WALL = 0x111111;

export interface CrewDraw {
  c: CrewState;
  x: number;
  y: number;
  selected: boolean;
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
    this.root.addChild(this.shieldG, this.hull, this.floorG, this.interior, this.stripeRoot, this.dynRoot, this.fog, this.overlay, this.gibRoot);
  }

  hasArt(): boolean {
    return !!texNow(`ship/${this.db.ships[this.shipId].img}_base.png`);
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

  private buildStatic(): void {
    const bp = this.db.ships[this.shipId];
    const L = this.layout;
    this.hull.removeChildren();
    this.interior.removeChildren();
    const base = texNow(`ship/${bp.img}_base.png`);
    const floor = texNow(`ship/${bp.img}_floor.png`);
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
    for (const s of bp.systems) {
      if (!s.img || !s.start) continue;
      const t = texNow(`ship/interior/${s.img}.png`);
      const r = L.rooms.find((q) => q.id === s.room);
      if (!t || !r) continue;
      const sp = new Sprite(t);
      sp.position.set(r.x * TILE, r.y * TILE);
      this.interior.addChild(sp);
    }
    const sh = texNow(`ship/${bp.img}_shields1.png`);
    const c = this.gridCentre();
    if (sh && !this.shieldArt) {
      this.shieldArt = new Sprite(sh);
      this.shieldArt.anchor.set(0.5);
      this.shieldArt.position.set(c.x + L.ellipse.x, c.y + L.ellipse.y);
      this.root.addChildAt(this.shieldArt, 0);
    }
    this.built = Boolean(base) || this.db.source !== "ftl";
  }

  update(v: ShipView, crew: CrewDraw[], time: number, o: ShipDrawOpts): void {
    if (!this.built) this.buildStatic();
    const L = this.layout;
    const up = this.upright;
    const d = this.dyn;
    const exploded = o.exploded ?? null;
    for (const n of [this.hull, this.floorG, this.interior, this.dynRoot, this.fog, this.stripeRoot]) n.visible = exploded === null;
    if (this.shieldArt) this.shieldArt.visible = exploded === null;
    if (exploded !== null) {
      this.drawGibs(exploded);
      return;
    }
    this.gibRoot.visible = false;
    d.begin();
    const visible = (room: number) => v.visibleRooms === null || v.visibleRooms.includes(room);
    const g = d.gfx("rooms");
    // Low O2: pink tint, plus FTL's warning stripes when it's nearly gone.
    for (const rs of v.rooms) {
      const r = L.rooms.find((q) => q.id === rs.id)!;
      const known = v.interior && rs.o2 >= 0 && visible(rs.id);
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
    // Hazards
    if (v.interior) {
      for (const rs of v.rooms) {
        if (!visible(rs.id)) continue;
        for (const t of Object.keys(rs.breaches)) this.tileAnim(`br${t}`, t, animFrame(this.db, "breach", Math.floor(time * 8)), 0x2a2a2a, 0.9);
        for (const t of Object.keys(rs.fires)) this.tileAnim(`fi${t}`, t, animFrame(this.db, "fire_large", Math.floor(time * 10 + t.length)), 0xff7a1a, 0.9);
      }
    }
    // Room system icons, FTL style: a glowing disc coloured by state, upright on screen.
    for (const s of Object.values(v.systems)) {
      if (!s) continue;
      const r = L.rooms.find((q) => q.id === s.room)!;
      const cx = (r.x + r.w / 2) * TILE;
      const cy = (r.y + r.h / 2) * TILE;
      const sub = s.id === "pilot" || s.id === "sensors" || s.id === "doors";
      const state = s.damage >= s.level ? "red" : s.damage > 0 ? "orange" : s.ion > 0 ? "blue" : s.power === 0 && !sub ? "grey" : "green";
      const t = texNow(`icons/s_${s.id}_${state}1.png`) ?? texNow(`icons/s_${s.id}_green1.png`);
      if (t) d.sprite(`ic${s.id}`, t, cx, cy, { anchor: 0.5, scale: 0.8, rotation: up });
      else {
        d.gfx(`icg${s.id}`).circle(cx, cy, 12).fill({ color: { green: 0x5fbf5f, orange: 0xf0a030, red: 0xe04040, grey: 0x777777, blue: 0x6aa8ff }[state] }).stroke({ color: 0xffffff, width: 2 });
        d.text(`ict${s.id}`, s.id.slice(0, 2).toUpperCase(), cx, cy, style(10, 0x000000, "700"), [0.5, 0.5], up);
      }
    }
    // Doors from FTL's door sheet: rows = door level, columns = opening frames.
    const doorTex = texNow("effects/door_sheet.png");
    const level = Math.max(1, Math.min(4, v.systems.doors?.level ?? 1));
    this.geo.doors.forEach((dr, i) => {
      const open = v.doors[i];
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
    });
    for (const cd of crew) this.drawCrew(cd, time);
    // Weapons on the hull; the battle decides the frame (charge lights, firing).
    if (L.img.w > 0 && this.hasArt()) {
      v.weapons.forEach((w, i) => {
        const m = L.mounts[i];
        const bp = this.db.weapons[w.bp];
        const anim = bp && this.db.weaponAnims[bp.weaponArt];
        if (!m || !bp || !anim) return;
        const f = weaponFrame(this.db, bp.weaponArt, o.weaponFrame?.(i) ?? 0);
        if (!f) return;
        d.sprite(`wp${i}`, f, L.img.x + m.x, L.img.y + m.y, {
          anchor: [anim.mountPoint.x / f.width, anim.mountPoint.y / f.height], scale: [m.mirror ? -1 : 1, 1],
          rotation: m.rotate ? Math.PI / 2 : 0,
        });
      });
    }
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
      if (visible(r.id) && v.interior) continue;
      fg.rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).fill({ color: 0x2b2f38, alpha: v.interior ? 0.85 : 0.5 });
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

  private drawCrew(cd: CrewDraw, time: number): void {
    const { c } = cd;
    if (c.dead) return;
    const d = this.dyn;
    const px = (cd.x + 0.5) * TILE;
    const py = (cd.y + 0.5) * TILE;
    const race = this.db.animSheets[c.race] ? c.race : "human";
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
    } else if (c.task === "man") {
      anim = `${race}_type_up`;
      fr = Math.floor(time * 6);
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
      d.sprite(key, t, px, py, { anchor: 0.5, rotation: rot, tint: this.enemy ? 0xffe0dc : 0xffffff });
    } else {
      d.gfx(key).circle(px, py, 9).fill({ color: this.enemy ? 0xe05555 : 0x5fa8ff }).stroke({ color: cd.selected ? 0x30ff30 : 0x000000, width: 2 });
    }
    // Health box (shown when hurt or selected), kept above the sprite on screen.
    if (cd.selected || c.hp < c.maxHp) {
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
        const tex = texNow(`ship/${bp.img}_gib${gb.n}.png`);
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
