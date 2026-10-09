/**
 * Textures from the player's own extracted FTL files (served at /assets/), with graceful fallback:
 * anything missing returns null and the renderer draws flat shapes instead.
 */
import { Assets, Rectangle, Texture } from "pixi.js";
import type { GameDB } from "@ftl/data";

const BASE = "/assets/img/";
const cache = new Map<string, Promise<Texture | null>>();
const ready = new Map<string, Texture | null>();

export function tex(path: string): Promise<Texture | null> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(BASE + path, { method: "HEAD" })
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").startsWith("image") ? Assets.load<Texture>(BASE + path) : null))
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

/** Frame i of an FTL anim (by name) or null. */
export function animFrame(db: GameDB, name: string, i: number): Texture | null {
  const a = db.anims[name];
  if (!a) return null;
  const sh = db.animSheets[a.sheet];
  if (!sh) return null;
  const t = texNow(sh.file);
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
  const sh = db.animSheets[a.sheet];
  if (!sh) return null;
  const t = texNow(sh.file);
  if (!t) return null;
  return frame(t, Math.min(i, a.frames - 1) * sh.fw, 0, sh.fw, sh.fh);
}

export async function preload(db: GameDB): Promise<boolean> {
  if (db.source !== "ftl") return false;
  const files = new Set<string>();
  for (const id of db.hangar) {
    const s = db.ships[id];
    files.add(`ship/${s.img}_base.png`);
    files.add(`ship/${s.img}_floor.png`);
    for (const sys of s.systems) if (sys.img) files.add(`ship/interior/${sys.img}.png`);
  }
  for (const sys of ["shields", "engines", "oxygen", "weapons", "medbay", "pilot", "sensors", "doors"])
    for (const c of ["green", "orange", "red", "grey"]) files.add(`icons/s_${sys}_${c}1.png`);
  for (const sh of Object.values(db.animSheets)) if (/^(weapons|effects|people\/human)/.test(sh.file)) files.add(sh.file);
  files.add("stars/bg_darknebula.png");
  const r = await Promise.all([...files].map(tex));
  return r.some(Boolean);
}
