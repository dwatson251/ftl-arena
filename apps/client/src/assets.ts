/**
 * Textures from the player's own extracted FTL files (served at /assets/), with graceful fallback:
 * anything missing returns null and the renderer draws flat shapes instead.
 */
import { Assets, Rectangle, Texture } from "pixi.js";
import type { GameDB } from "@ftl/data";

const BASE = "/assets/img/";
const cache = new Map<string, Promise<Texture | null>>();
const ready = new Map<string, Texture | null>();
/** Every file the extractor wrote (assets-local/manifest.json): paths not in it are never requested. */
let manifest: Set<string> | null = null;

let manifestLoaded: Promise<void> | null = null;
export function loadManifest(): Promise<void> {
  manifestLoaded ??= (async () => {
    try {
      const r = await fetch("/assets/manifest.json");
      if (!r.ok) return;
      const m = (await r.json()) as { files: string[]; extractedAt?: string };
      manifest = new Set(m.files);
      // A fresh extract (new FTL data) invalidates the offline copy of the old one.
      await syncAssetCache(m.extractedAt ?? "");
    } catch {
      manifest = null;
    }
  })();
  return manifestLoaded;
}

const CACHE_KEY = "ftl-arena-assets-version";
/** Drop the service worker's asset cache when the extract it holds is not the server's. */
async function syncAssetCache(version: string): Promise<void> {
  try {
    if (localStorage.getItem(CACHE_KEY) === version) return;
    if ("caches" in window) await caches.delete("ftl-arena-assets");
    localStorage.setItem(CACHE_KEY, version);
  } catch {}
}

/** Register the offline cache (sw.js). Browsers only allow it on https or localhost; elsewhere it's skipped. */
export function registerOfflineCache(): void {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
}

/** True when the extracted files include img/<path> (always true before the manifest loads). */
export function hasImg(path: string): boolean {
  return !manifest || manifest.has(`img/${path}`);
}

export function tex(path: string): Promise<Texture | null> {
  let p = cache.get(path);
  if (!p && !hasImg(path)) {
    p = Promise.resolve(null);
    ready.set(path, null);
    cache.set(path, p);
  }
  if (!p) {
    // One GET per asset (no HEAD probe: hundreds of HEADs through Vite's dev proxy get aborted). A
    // missing file just resolves to null and the renderer draws its fallback.
    p = Assets.load<Texture>({ src: BASE + path, loadParser: "loadTextures" })
      .then((t) => t ?? null)
      .catch(() => null)
      .then((t) => {
        ready.set(path, t);
        return t;
      });
    cache.set(path, p);
  }
  return p;
}

/** Synchronous lookup for a texture already requested; kicks off the load if not. */
/** FTL's beacon backdrops and planets (Survival picks one of each per battle). */
export const BACKDROPS = ["bg_darknebula", "bg_blueStarcluster", "bg_dullstars", "bg_dullstars2", "bg_lonelyRedStar", "bg_lonelystar"];
export const PLANETS = ["planet_bigblue", "planet_brown", "planet_gas_blue", "planet_gas_yellow", "planet_peach", "planet_red", "planet_populated_brown", "planet_populated_dark", "planet_populated_orange"];

export function texNow(path: string): Texture | null {
  if (!cache.has(path)) void tex(path);
  return ready.get(path) ?? null;
}

const frameCache = new Map<string, Texture>();
export function frame(t: Texture, x: number, y: number, w: number, h: number): Texture {
  const k = `${t.uid}:${x},${y},${w},${h}`;
  let f = frameCache.get(k);
  if (!f) {
    f = new Texture({ source: t.source, frame: new Rectangle(x, y, w, h) });
    frameCache.set(k, f);
  }
  return f;
}

/** Frame i of an FTL anim (by name) or null. `file` swaps the sheet image (e.g. a crew colour layer). */
export function animFrame(db: GameDB, name: string, i: number, file?: string): Texture | null {
  const a = db.anims[name];
  if (!a) return null;
  const sh = a.sheetDef ?? db.animSheets[a.sheet];
  if (!sh) return null;
  const t = texNow(file ?? sh.file);
  if (!t) return null;
  const fx = (a.x + (i % a.frames)) * sh.fw;
  // FTL counts sheet rows from the bottom.
  const rows = Math.round(sh.h / sh.fh);
  const fy = (rows - 1 - a.y) * sh.fh;
  if (fx + sh.fw > t.width || fy < 0) return null;
  return frame(t, fx, fy, sh.fw, sh.fh);
}

export function weaponFrame(db: GameDB, art: string, i: number): Texture | null {
  const a = db.weaponAnims[art];
  if (!a) return null;
  const sh = a.sheetDef ?? db.animSheets[a.sheet];
  if (!sh) return null;
  const t = texNow(sh.file);
  if (!t) return null;
  return frame(t, Math.min(i, a.frames - 1) * sh.fw, 0, sh.fw, sh.fh);
}

/** A hull's shield image: B/C variants without their own borrow the A hull's (kestral_2 -> kestral). */
export function shieldFile(img: string): string {
  const own = `ship/${img}_shields1.png`;
  if (hasImg(own)) return own;
  return `ship/${img.replace(/_\d+$/, "")}_shields1.png`;
}

/**
 * Load every texture the game uses before showing a menu, reporting progress (0..1). At most `PARALLEL`
 * requests run at once, so a dev proxy isn't flooded.
 */
export async function preload(db: GameDB, progress: (k: number) => void = () => {}, extra: (() => Promise<unknown>)[] = []): Promise<boolean> {
  if (db.source !== "ftl") {
    progress(1);
    return false;
  }
  await loadManifest();
  const files = new Set<string>();
  for (const id of db.hangar) {
    const s = db.ships[id];
    files.add(`ship/${s.img}_base.png`);
    files.add(`ship/${s.img}_floor.png`);
    for (const sys of s.systems) if (sys.img) files.add(`ship/interior/${sys.img}.png`);
  }
  for (const sys of ["shields", "engines", "oxygen", "weapons", "medbay", "pilot", "sensors", "doors"])
    for (const c of ["green", "orange", "red", "grey"]) files.add(`icons/s_${sys}_${c}1.png`);
  for (const sh of Object.values(db.animSheets)) if (/^(weapons|effects|people)\//.test(sh.file)) files.add(sh.file);
  for (const a of [...Object.values(db.anims), ...Object.values(db.weaponAnims)]) if (a.sheetDef) files.add(a.sheetDef.file);
  for (const r of Object.keys(db.crew)) files.add(`people/${r}_color.png`);
  for (const id of db.hangar) {
    const s = db.ships[id];
    for (const g of db.layouts[s.layout]?.gibs ?? []) files.add(`ship/${s.img}_gib${g.n}.png`);
    files.add(shieldFile(s.img));
    files.add(`customizeUI/miniship_${s.img}.png`);
  }
  for (const sys of ["shields", "engines", "oxygen", "weapons", "medbay", "clonebay", "drones", "teleporter", "cloaking", "hacking", "pilot", "sensors", "doors"]) {
    for (const c of ["blue", "grey", "orange", "red", "green"]) files.add(`icons/s_${sys}_${c}1.png`);
    files.add(`icons/s_${sys}_overlay.png`);
  }
  for (const id of db.enemies ?? []) {
    const s = db.ships[id];
    files.add(`${s.artDir}/${s.img}_base.png`);
    for (const g of db.layouts[s.layout]?.gibs ?? []) files.add(`${s.artDir}/${s.img}_gib${g.n}.png`);
  }
  for (let i = 1; i <= 4; i++) files.add(`misc/crosshairs_placed${i}.png`), files.add(`misc/crosshairs_placed${i}_yellow.png`);
  for (const d of Object.values(db.droneBPs ?? {})) if (d.image) for (const v of ["base", "on", "off", "gun_on"]) files.add(`ship/drones/${d.image}_${v}.png`);
  files.add("statusUI/top_drones_on.png");
  for (const f of ["base", "top_on", "top_select2", "bottom_on", "bottom_off", "bottom_select2", "charging_on", "charging_off"]) files.add(`systemUI/button_teleport_${f}.png`);
  files.add("ship/drones/boarder_engine.png");
  for (let i = 1; i <= 9; i++) files.add(`icons/locking/s_ring_${i}_base.png`);
  files.add("icons/locking/s_ring_timer.png");
  for (let i = 1; i <= 9; i++) files.add(`icons/locking/s_octa_${i}_base.png`);
  files.add("icons/locking/s_octa_timer.png");
  files.add("icons/s_hacked.png");
  files.add("icons/locking/s_lock.png");
  files.add("people/mindcontrol_strip8.png");
  files.add("systemUI/button_battery3_base.png");
  for (let i = 1; i <= 4; i++) files.add(`systemUI/button_artillery_${i}.png`);
  for (const id of ["battery", "mind", "artillery"]) for (const c of ["green", "grey", "orange", "red", "blue"]) files.add(`icons/s_${id}_${c}1.png`);
  for (const id of db.enemies ?? []) if (/^BOSS_/.test(id)) files.add(`ships_glow/${db.ships[id].img}_cloak.png`);
  for (let n = 1; n <= 4; n++) for (const f of ["base", "on", "off", "select2", "charging_on", "charging_off"]) files.add(`systemUI/button_cloaking${n}_${f}.png`);
  for (const f of ["base", "land", "extend", "light1", "light2"]) files.add(`ship/drones/drone_hack_${f}.png`);
  for (const f of ["solo", "bottom", "middle", "top", "fill"]) files.add(`systemUI/clonebar_small_${f}.png`);
  for (const f of ["1x2", "2x1", "2x2"]) files.add(`effects/low_o2_stripes_${f}.png`);
  files.add("effects/fire_smoke.png");
  for (const f of ["statusUI/energy_shield_box.png", "statusUI/energy_shield_bar.png", "combatUI/box_hostiles_shield_super5.png", "combatUI/box_hostiles_shield_super12.png"]) files.add(f);
  // Hazard scenery and asteroids.
  for (const f of ["stars/planet_sun1.png", "effects/pulsar_backL.png", "effects/pulsar_frontL.png", "stars/nebula_large_a.png", "stars/nebula_large_b.png", "stars/nebula_large_c.png"]) files.add(f);
  for (let i = 0; i < 10; i++) files.add(`asteroids/asteroid${i}.png`);
  for (let i = 1; i <= 3; i++) files.add(`asteroids/asteroid_back${i}.png`);
  for (const f of UI_FILES) files.add(f);
  files.add("stars/bg_darknebula.png");
  // Survival jumps to a new beacon each battle: FTL's other backdrops and planets.
  for (const b of BACKDROPS) files.add(`stars/${b}.png`);
  files.add("effects/glowing_star.png");
  // Crystal Lockdown's shards (forming and shattering).
  files.add("Missile.png");
  files.add("people/crystal_1.png");
  files.add("people/crystal_2.png");
  files.add("warnings/backglow_warning_red.png");
  for (const d of ["star", "pulsar", "asteroids", "nebula", "storm", "pds"]) files.add(`warnings/danger_${d}.png`);
  for (const pl of PLANETS) files.add(`stars/${pl}.png`);
  const probe = `ship/${db.ships[db.hangar[0]]?.img}_base.png`;
  // The extras (fonts, sounds) go first so slow ones run alongside the textures, not after them.
  const jobs: (() => Promise<unknown>)[] = [...extra, ...[...files].map((f) => () => tex(f))];
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      await job().catch(() => null);
      progress(++done / jobs.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  artReady.forEach((f) => f());
  return !!(await tex(probe));
}

const PARALLEL = 48;

/** Called once every preloaded texture has arrived (for one last re-render). */
export const artReady: (() => void)[] = [];

/** FTL HUD art the battle screen uses. */
export const UI_FILES = [
  "statusUI/top_hull.png", "statusUI/top_hull_red.png", "statusUI/top_hull_bar_mask.png", "statusUI/top_hull_label.png", "statusUI/top_hull_red_label.png",
  "statusUI/top_shields4_on.png", "statusUI/top_shields4_red.png", "statusUI/top_shieldsquare1_on.png", "statusUI/top_shieldsquare1_off.png",
  "statusUI/top_evade_oxygen.png", "statusUI/top_evade_oxygen_both_red.png", "statusUI/top_missiles_on.png", "statusUI/top_missiles_on_red.png",
  "combatUI/box_hostiles2.png", "combatUI/box_hostiles_mask.png", "combatUI/box_hostiles_hull2.png", "combatUI/box_hostiles_shield1.png",
  "combatUI/box_hostiles_shield2.png", "combatUI/box_hostiles_weapon_charge.png", "combatUI/box_hostiles_weapon_chargebar.png",
  "box_weapons_bottom2.png", "box_weapons_bottom3.png", "box_weapons_bottom4.png", "box_weapons_bottom_label.png", "box_weapons_autofire_base.png",
  "bar_weapon_minibox_glow.png", "wireUI/wire_full.png", "wireUI/wire_456_cap.png", "wireUI/wire_36.png", "wireUI/wire_54_cap.png",
  "systemUI/button_door_base.png", "systemUI/button_door_top_on.png", "systemUI/button_door_top_off.png", "systemUI/button_door_bottom_on.png",
  "systemUI/button_door_bottom_off.png", "systemUI/button_door_top_select2.png", "systemUI/button_door_bottom_select2.png",
  "people/green_destination.png", "systemUI/manning_white.png", "people/healing_strip11.png", "ship/interior/clone_bottom.png", "ship/interior/clone_top.png", "ship/interior/clone_gas.png", "combatUI/icon_chain_on.png", "combatUI/icon_chain_off.png", "statusUI/button_station_base.png", "statusUI/button_station_assign_on.png", "statusUI/button_station_return_on.png", "effects/thrusters_on.png", "ship/enemy_shields.png", "upgradeUI/details_scrap.png", "people/health_box.png", "people/health_box_red.png", "effects/door_sheet.png", "effects/low_o2_stripes_2x2.png", "Text_pause1.png", "Text_pause2.png",
];
