/**
 * Draws one ship. The container's origin is the room grid's top-left (tile 0,0), in grid pixels, so sim
 * coordinates (tiles * 35, beam/flak points) map 1:1. Hull art is placed at the layout's <img> offset and
 * the floor at <img> + <floor>. Without extracted art it falls back to flat shapes.
 */
import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { GameDB, ShipLayout, SystemId } from "@ftl/data";
import { geometry, TILE, usable, type CrewState, type Geometry, type ShipView } from "@ftl/sim";
import { animFrame, texNow, weaponFrame } from "../assets.ts";

const FLOOR = 0xe6e2db;
const GRID = 0xb9b4aa;
const WALL = 0x111111;
const DOOR = 0xe08a2c;

export interface CrewDraw {
  c: CrewState;
  /** Interpolated tile position. */
  x: number;
  y: number;
  selected: boolean;
}

export class ShipRenderer {
  root = new Container();
  private hull = new Container();
  private floorG = new Graphics();
  private interior = new Container();
  private dyn = new Graphics();
  private hazards = new Container();
  private icons = new Container();
  private crewLayer = new Container();
  private weaponsLayer = new Container();
  private shield = new Container();
  private shieldG = new Graphics();
  private fog = new Graphics();
  overlay = new Graphics();
  readonly geo: Geometry;
  readonly layout: ShipLayout;
  private built = false;

  constructor(public db: GameDB, public shipId: string, public enemy: boolean) {
    const bp = db.ships[shipId];
    this.layout = db.layouts[bp.layout];
    this.geo = geometry(this.layout);
    this.shield.addChild(this.shieldG);
    this.root.addChild(this.shield, this.hull, this.floorG, this.interior, this.dyn, this.hazards, this.icons, this.weaponsLayer, this.crewLayer, this.fog, this.overlay);
  }

  /** Grid-pixel bounds of the hull art (or rooms when there's no art). */
  bounds(): { x: number; y: number; w: number; h: number } {
    const L = this.layout;
    if (L.img.w > 0 && texNow(`ship/${this.db.ships[this.shipId].img}_base.png`)) return { ...L.img };
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const r of L.rooms) {
      x1 = Math.min(x1, r.x * TILE); y1 = Math.min(y1, r.y * TILE);
      x2 = Math.max(x2, (r.x + r.w) * TILE); y2 = Math.max(y2, (r.y + r.h) * TILE);
    }
    return { x: x1 - 40, y: y1 - 40, w: x2 - x1 + 80, h: y2 - y1 + 80 };
  }

  gridCentre(): { x: number; y: number } {
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const r of this.layout.rooms) {
      x1 = Math.min(x1, r.x * TILE); y1 = Math.min(y1, r.y * TILE);
      x2 = Math.max(x2, (r.x + r.w) * TILE); y2 = Math.max(y2, (r.y + r.h) * TILE);
    }
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
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
      const g = new Graphics();
      g.roundRect(b.x, b.y, b.w, b.h, 60).fill({ color: 0x3b4252 }).stroke({ color: 0x8892a6, width: 3 });
      this.hull.addChild(g);
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
    this.shield.removeChildren();
    if (sh) {
      const s = new Sprite(sh);
      s.anchor.set(0.5);
      s.position.set(c.x + L.ellipse.x, c.y + L.ellipse.y);
      this.shield.addChild(s);
    }
    this.shield.addChild(this.shieldG);
    this.built = Boolean(base) || this.db.source !== "ftl";
  }

  /** Redraw dynamic state. `time` in seconds drives animations. */
  update(v: ShipView, crew: CrewDraw[], time: number, hover: { room: number; door: number }): void {
    if (!this.built) this.buildStatic();
    const L = this.layout;
    const g = this.dyn.clear();
    const visible = (room: number) => v.visibleRooms === null || v.visibleRooms.includes(room);
    // O2 tint and system rooms
    if (v.interior) {
      for (const rs of v.rooms) {
        const r = L.rooms.find((q) => q.id === rs.id)!;
        if (rs.o2 >= 0 && rs.o2 < 66 && visible(rs.id)) {
          g.rect(r.x * TILE + 2, r.y * TILE + 2, r.w * TILE - 4, r.h * TILE - 4).fill({ color: 0xff3b6b, alpha: ((66 - rs.o2) / 66) * 0.45 });
        }
      }
    }
    if (hover.room >= 0) {
      const r = L.rooms.find((q) => q.id === hover.room);
      if (r) g.rect(r.x * TILE + 2, r.y * TILE + 2, r.w * TILE - 4, r.h * TILE - 4).stroke({ color: this.enemy ? 0xff5555 : 0x7bd47b, width: 3 });
    }
    // Doors
    this.geo.doors.forEach((d, i) => {
      const open = v.doors[i];
      const hot = hover.door === i;
      const col = hot ? 0xffe28a : DOOR;
      if (d.vertical) {
        if (open) g.rect(d.px - 3, d.py - 17, 6, 4).rect(d.px - 3, d.py + 13, 6, 4).fill({ color: col });
        else g.rect(d.px - 3, d.py - 15, 6, 30).fill({ color: col }).stroke({ color: 0x000000, width: 1 });
      } else if (open) g.rect(d.px - 17, d.py - 3, 4, 6).rect(d.px + 13, d.py - 3, 4, 6).fill({ color: col });
      else g.rect(d.px - 15, d.py - 3, 30, 6).fill({ color: col }).stroke({ color: 0x000000, width: 1 });
    });
    // Hazards
    this.hazards.removeChildren();
    if (v.interior) {
      for (const rs of v.rooms) {
        if (!visible(rs.id)) continue;
        for (const t of Object.keys(rs.breaches)) this.tileSprite(t, animFrame(this.db, "breach", Math.floor(time * 8)), 0x2a2a2a, 0.6);
        for (const t of Object.keys(rs.fires)) this.tileSprite(t, animFrame(this.db, "fire_large", Math.floor(time * 10)), 0xff7a1a, 0.8);
      }
    }
    // System icons with power bars
    this.icons.removeChildren();
    for (const s of Object.values(v.systems)) {
      if (!s) continue;
      const r = L.rooms.find((q) => q.id === s.room)!;
      const cx = (r.x + r.w / 2) * TILE;
      const cy = (r.y + r.h / 2) * TILE;
      const broken = s.damage >= s.level;
      const color = broken ? "red" : s.damage > 0 ? "orange" : s.power === 0 && !["pilot", "sensors", "doors"].includes(s.id) ? "grey" : "green";
      const t = texNow(`icons/s_${s.id}_${color}1.png`);
      if (t) {
        const sp = new Sprite(t);
        sp.anchor.set(0.5);
        sp.scale.set(0.5);
        sp.position.set(cx, cy);
        if (s.ion > 0) sp.tint = 0x88bbff;
        if (this.enemy) sp.scale.x = -0.5;
        this.icons.addChild(sp);
      } else {
        const gg = new Graphics().circle(cx, cy, 11).fill({ color: { green: 0x5fbf5f, orange: 0xf0a030, red: 0xe04040, grey: 0x777777 }[color] });
        const tx = new Text({ text: s.id[0].toUpperCase() + (s.id === "shields" ? "h" : s.id === "sensors" ? "e" : ""), style: { fill: 0x000000, fontSize: 11, fontWeight: "700" } });
        tx.anchor.set(0.5);
        tx.position.set(cx, cy);
        if (this.enemy) tx.scale.x = -1;
        this.icons.addChild(gg, tx);
      }
      if (s.repair > 0 && s.damage > 0) {
        const bar = new Graphics().rect(cx - 14, cy + 14, 28, 4).fill({ color: 0x222222 }).rect(cx - 14, cy + 14, 28 * s.repair, 4).fill({ color: 0xf0d030 });
        this.icons.addChild(bar);
      }
    }
    // Crew
    this.crewLayer.removeChildren();
    for (const cd of crew) this.drawCrew(cd, time);
    // Weapons on the hull
    this.weaponsLayer.removeChildren();
    if (L.img.w > 0 && texNow(`ship/${this.db.ships[this.shipId].img}_base.png`)) {
      v.weapons.forEach((w, i) => {
        const m = L.mounts[i];
        const bp = this.db.weapons[w.bp];
        if (!m || !bp) return;
        const anim = this.db.weaponAnims[bp.weaponArt];
        const ready = w.volleys > 0 || (w.charge >= 0 && w.charge >= bp.cooldown * 0.999);
        const f = weaponFrame(this.db, bp.weaponArt, ready && anim ? anim.chargedFrame : 0);
        if (!f || !anim) return;
        const sp = new Sprite(f);
        sp.anchor.set(anim.mountPoint.x / f.width, anim.mountPoint.y / f.height);
        sp.position.set(L.img.x + m.x, L.img.y + m.y);
        if (m.mirror) sp.scale.x = -1;
        if (m.rotate) sp.rotation = Math.PI / 2;
        this.weaponsLayer.addChild(sp);
      });
    }
    // Shields
    const sg = this.shieldG.clear();
    const c = this.gridCentre();
    const hasArt = this.shield.children.length > 1;
    if (hasArt) this.shield.children[0].alpha = v.shieldLayers > 0 ? 0.35 + 0.15 * v.shieldLayers : 0;
    else if (v.shieldLayers > 0) {
      const b = this.bounds();
      sg.ellipse(c.x + L.ellipse.x, c.y + L.ellipse.y, b.w / 2 + 10, b.h / 2 + 10).fill({ color: 0x4aa8ff, alpha: 0.08 * v.shieldLayers }).stroke({ color: 0x6fc0ff, width: 2, alpha: 0.6 });
    }
    // Fog over rooms the viewer can't see
    const fg = this.fog.clear();
    for (const r of L.rooms) {
      if (visible(r.id) && v.interior) continue;
      fg.rect(r.x * TILE, r.y * TILE, r.w * TILE, r.h * TILE).fill({ color: 0x2b2f38, alpha: v.interior ? 0.85 : 0.55 });
    }
  }

  private tileSprite(k: string, t: Texture | null, fallback: number, alpha: number): void {
    const [x, y] = k.split(",").map(Number);
    if (t) {
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.position.set((x + 0.5) * TILE, (y + 0.5) * TILE);
      s.alpha = alpha;
      this.hazards.addChild(s);
    } else this.hazards.addChild(new Graphics().rect(x * TILE + 4, y * TILE + 4, TILE - 8, TILE - 8).fill({ color: fallback, alpha }));
  }

  private drawCrew(cd: CrewDraw, time: number): void {
    const { c } = cd;
    const px = (cd.x + 0.5) * TILE;
    const py = (cd.y + 0.5) * TILE;
    const walking = c.task === "walk" && c.path.length > 0;
    let anim = "human_walk_down";
    let fr = 0;
    if (walking) {
      const [nx, ny] = c.path[0].split(",").map(Number);
      const dx = nx - cd.x;
      const dy = ny - cd.y;
      anim = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "human_walk_right" : "human_walk_left") : dy > 0 ? "human_walk_down" : "human_walk_up";
      fr = Math.floor(time * 8);
    } else if (c.task === "repair" || c.task === "breach") {
      anim = "human_repair";
      fr = Math.floor(time * 10);
    } else if (c.task === "fire") {
      anim = "human_fire_down";
      fr = Math.floor(time * 10);
    } else if (c.task === "man") {
      anim = "human_type_up";
      fr = Math.floor(time * 6);
    }
    const t = c.dead ? null : animFrame(this.db, anim, fr);
    if (c.dead) return;
    if (cd.selected) this.crewLayer.addChild(new Graphics().circle(px, py + 6, 12).stroke({ color: 0x7bff7b, width: 2 }));
    if (t) {
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.position.set(px, py);
      if (this.enemy) s.tint = 0xffc8c8;
      this.crewLayer.addChild(s);
    } else {
      this.crewLayer.addChild(new Graphics().circle(px, py, 9).fill({ color: this.enemy ? 0xe05555 : 0x5fa8ff }).stroke({ color: 0x000000, width: 2 }));
    }
    const hp = Math.max(0, c.hp / c.maxHp);
    this.crewLayer.addChild(
      new Graphics().rect(px - 12, py - 20, 24, 3).fill({ color: 0x330000 }).rect(px - 12, py - 20, 24 * hp, 3).fill({ color: hp > 0.5 ? 0x5fdc5f : hp > 0.25 ? 0xf0c030 : 0xff4040 }),
    );
    if (c.stun > 0) this.crewLayer.addChild(new Graphics().circle(px, py - 14, 4).fill({ color: 0x9fd0ff }));
  }

  /** Grid point of weapon mount i (for projectile origins). */
  mountPoint(i: number): { x: number; y: number } {
    const L = this.layout;
    const m = L.mounts[i];
    if (m && L.img.w > 0) return { x: L.img.x + m.x, y: L.img.y + m.y };
    const c = this.gridCentre();
    return { x: c.x + 80, y: c.y + (i % 2 ? 40 : -40) };
  }

  /** Hit-test a grid point against rooms and doors. */
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
    const k = `${Math.floor(px / TILE)},${Math.floor(py / TILE)}`;
    const t = this.geo.tiles.get(k);
    return { room: t ? t.room : -1, door };
  }
}

export function systemUsable(s: { level: number; damage: number; ion: number }): number {
  return usable(s as never);
}

export type { SystemId };
