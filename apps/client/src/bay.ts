/**
 * The Launch step's hangar bay: the built ship as FTL's ship-select screen shows it (hull, floor and rooms,
 * system icons, doors, guns on their mounts, the crew at their starting spots) parked in FTL's hangar. It's
 * the battle's own ShipRenderer on a small Pixi app of its own, so it looks exactly like the fight will.
 */
import { Application, Container, Sprite } from "pixi.js";
import type { GameDB } from "@ftl/data";
import { buildShip, type Loadout, type ShipView } from "@ftl/sim";
import { texNow } from "./assets.ts";
import { isSame } from "./presets.ts";
import { ShipRenderer } from "./render/ship.ts";

/** The bay inside FTL's custom_background.png (the framed apron), in its own pixels. */
const BAY = { x: 270, y: 0, w: 720, h: 440 };

export class HangarBay {
  readonly el = document.createElement("div");
  private app: Application | null = null;
  private ready: Promise<void>;
  private world = new Container();
  private ship: ShipRenderer | null = null;
  private view: ShipView | null = null;
  private shown: Loadout | null = null;
  private time = 0;

  constructor(private db: GameDB) {
    this.el.className = "bay";
    this.ready = (async () => {
      const app = new Application();
      await app.init({ width: 720, height: 400, background: 0x2a2c2e, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
      this.app = app;
      app.canvas.classList.add("bay-canvas");
      this.el.appendChild(app.canvas);
      app.stage.addChild(this.world);
      app.ticker.add((t) => this.frame(t.deltaMS / 1000));
    })();
  }

  /** Show this build (rebuilt only when it changes). */
  show(l: Loadout): void {
    if (this.shown && isSame(this.shown, l) && this.shown.ship === l.ship) return;
    this.shown = structuredClone(l);
    void this.ready.then(() => this.rebuild());
  }

  private rebuild(): void {
    const l = this.shown;
    if (!l || !this.app) return;
    const db = this.db;
    const st = buildShip(db, l, 0, "", () => "Crew");
    this.view = { ...st, visibleRooms: null, interior: true, weaponsKnown: true, systemsKnown: true } as ShipView;
    this.world.removeChildren();
    const bg = texNow("customizeUI/custom_background.png");
    if (bg) {
      const s = new Sprite(bg);
      // Crop to the bay and fill the canvas with it.
      const k = Math.max(720 / BAY.w, 400 / BAY.h);
      s.scale.set(k);
      s.position.set(-BAY.x * k + (720 - BAY.w * k) / 2, -BAY.y * k + (400 - BAY.h * k) / 2);
      this.world.addChild(s);
    }
    if (!this.ship || this.ship.shipId !== l.ship) this.ship = new ShipRenderer(db, l.ship, false);
    this.world.addChild(this.ship.root);
    this.ship.update(this.view, [], 0, { hover: { room: -1, door: -1 } });
    // Fit the hull into the bay with a margin, centred.
    const b = this.ship.bounds();
    const k = Math.min((720 * 0.92) / b.w, (400 * 0.86) / b.h, 1.4);
    this.ship.root.scale.set(k);
    this.ship.root.position.set(360 - (b.x + b.w / 2) * k, 200 - (b.y + b.h / 2) * k);
  }

  private frame(dt: number): void {
    this.time += dt;
    const v = this.view;
    if (!v || !this.ship) return;
    const crew = v.crew.filter((c) => !c.dead).map((c) => ({ c, x: c.x, y: c.y, selected: false }));
    this.ship.update(v, crew, this.time, { hover: { room: -1, door: -1 }, engines: 0, clock: this.time });
  }

  /** Stop animating while the Launch step isn't on screen. */
  pause(on: boolean): void {
    void this.ready.then(() => {
      if (!this.app) return;
      if (on) this.app.ticker.stop();
      else this.app.ticker.start();
    });
  }

  destroy(): void {
    void this.ready.then(() => {
      this.app?.destroy(true, { children: true });
      this.app = null;
    });
  }
}
