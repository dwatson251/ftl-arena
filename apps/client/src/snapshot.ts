/**
 * A preset's snapshot: the ship as it looks in battle from outside (hull art and its guns, deployed, on their
 * mounts; no rooms) on the preset's own random backdrop. Drawn on a 2D canvas from the player's /assets.
 */
import type { GameDB } from "@ftl/data";
import type { Loadout } from "@ftl/sim";
import type { PresetLook } from "./presets.ts";

const images = new Map<string, Promise<HTMLImageElement | null>>();

function img(path: string): Promise<HTMLImageElement | null> {
  let p = images.get(path);
  if (!p) {
    p = new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = `/assets/img/${path}`;
    });
    images.set(path, p);
  }
  return p;
}

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Paint `loadout` on `look` into `canvas` (sized by its CSS box, drawn at 2x). */
export async function drawSnapshot(canvas: HTMLCanvasElement, db: GameDB, loadout: Loadout, look: PresetLook, art: boolean, seed = ""): Promise<void> {
  const W = canvas.clientWidth || 300;
  const H = canvas.clientHeight || 150;
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const bp = db.ships[loadout.ship];
  const L = bp && db.layouts[bp.layout];
  if (!art || !bp || !L) {
    // No art: a coloured backdrop from the preset id and a hull-shaped block.
    const hue = hash(seed || loadout.ship) % 360;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${hue} 45% 14%)`);
    g.addColorStop(1, `hsl(${(hue + 60) % 360} 40% 8%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#3b4252";
    ctx.strokeStyle = "#8892a6";
    ctx.beginPath();
    ctx.roundRect(W * 0.15, H * 0.3, W * 0.7, H * 0.4, 20);
    ctx.fill();
    ctx.stroke();
    return;
  }
  const [bg, planet, hull, ...guns] = await Promise.all([
    img(`stars/${look.bg}.png`),
    look.planet ? img(`stars/${look.planet}.png`) : Promise.resolve(null),
    img(`${bp.artDir ?? "ship"}/${bp.img}_base.png`),
    ...loadout.weapons.map((w) => {
      const wa = db.weaponAnims[db.weapons[w]?.weaponArt ?? ""];
      const sh = wa && (wa.sheetDef ?? db.animSheets[wa.sheet]);
      return sh ? img(sh.file) : Promise.resolve(null);
    }),
  ]);
  // Backdrop: a crop of the background, maybe mirrored, and a planet off to one side.
  ctx.fillStyle = "#05070c";
  ctx.fillRect(0, 0, W, H);
  if (bg) {
    const cw = Math.min(bg.width, (bg.height * W) / H);
    const ch = (cw * H) / W;
    ctx.save();
    if (look.flip) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(bg, look.x * (bg.width - cw), look.y * (bg.height - ch), cw, ch, 0, 0, W, H);
    ctx.restore();
  }
  if (planet) {
    const s = (H * 0.9) / Math.max(planet.width, planet.height);
    const px = look.flip ? W * 0.08 : W * 0.92;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(planet, px - (planet.width * s) / 2, H * (0.2 + 0.6 * look.y) - (planet.height * s) / 2, planet.width * s, planet.height * s);
    ctx.globalAlpha = 1;
  }
  // The ship, fitted to the frame (its hull art plus a margin for the guns).
  const pad = 16;
  const iw = L.img.w || hull?.width || 400;
  const ih = L.img.h || hull?.height || 200;
  const scale = Math.min((W - 16) / (iw + pad * 2), (H - 12) / (ih + pad * 2));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(scale, scale);
  ctx.translate(-(L.img.x + iw / 2), -(L.img.y + ih / 2));
  // Guns sit under the hull art, as in battle, deployed and charged.
  loadout.weapons.forEach((w, i) => {
    const m = L.mounts[i];
    const wa = db.weaponAnims[db.weapons[w]?.weaponArt ?? ""];
    const sh = wa && (wa.sheetDef ?? db.animSheets[wa.sheet]);
    const sheet = guns[i];
    if (!m || !wa || !sh || !sheet) return;
    ctx.save();
    ctx.translate(L.img.x + m.x, L.img.y + m.y);
    if (m.rotate) ctx.rotate(Math.PI / 2);
    if (m.mirror) ctx.scale(-1, 1);
    ctx.drawImage(sheet, Math.min(wa.chargedFrame, wa.frames - 1) * sh.fw, 0, sh.fw, sh.fh, -wa.mountPoint.x, -wa.mountPoint.y, sh.fw, sh.fh);
    ctx.restore();
  });
  if (hull) ctx.drawImage(hull, L.img.x, L.img.y);
  ctx.restore();
}
