/** FTL art as HTML (CSS sprites from the player's /assets): the hangar's cards and the Survival rewards. */
import type { GameDB } from "@ftl/data";
import { hasImg } from "./assets.ts";

export const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function sheetCss(file: string, fx: number, fy: number, fw: number, fh: number, sheetW: number, sheetH: number, scale: number): string {
  return `background:url('/assets/img/${file}') -${fx * scale}px -${fy * scale}px / ${sheetW * scale}px ${sheetH * scale}px no-repeat;width:${fw * scale}px;height:${fh * scale}px`;
}

/** A crew portrait (FTL counts sheet rows from the bottom). */
export function portraitHtml(db: GameDB, race: string, art: boolean, scale = 1.4): string {
  const a = db.anims[`${race}_portrait`] ?? db.anims[`${race}_walk_down`];
  const sh = a && (a.sheetDef ?? db.animSheets[a.sheet]);
  if (!a || !sh || !art) return `<div class="ph-portrait">${esc(race[0].toUpperCase())}</div>`;
  const rows = Math.round(sh.h / sh.fh);
  return `<div class="portrait" style="${sheetCss(sh.file, a.x * sh.fw, (rows - 1 - a.y) * sh.fh, sh.fw, sh.fh, sh.w, sh.h, scale)}"></div>`;
}

/** A weapon's art with its charge lights on, turned to point right. */
export function weaponArtHtml(db: GameDB, id: string, art: boolean, scale = 1): string {
  const bp = db.weapons[id];
  const wa = bp && db.weaponAnims[bp.weaponArt];
  const sh = wa && (wa.sheetDef ?? db.animSheets[wa.sheet]);
  if (!wa || !sh || !art) return `<div class="ph-weapon">${esc(bp?.type?.[0] ?? "?")}</div>`;
  const css = sheetCss(sh.file, wa.chargedFrame * sh.fw, 0, sh.fw, sh.fh, sh.w, sh.h, scale);
  return `<div class="weapon-art" style="width:${sh.fh * scale}px;height:${sh.fw * scale}px"><div style="${css};transform:rotate(90deg) translate(0,-100%);transform-origin:0 0;position:absolute;left:0;top:0"></div></div>`;
}

/** A drone's art: its sprite, or for interior drones their crew-style portrait or FTL's drone icon. */
export function droneArtHtml(db: GameDB, id: string, art: boolean): string {
  const bp = db.droneBPs[id];
  if (!bp || !art) return `<div class="ph-weapon">D</div>`;
  if (!bp.image) {
    const sheet = { BATTLE: "battle", REPAIR: "repair" }[bp.type as string] ?? (bp.id === "BOARDER_ION" ? "boarder_ion" : "");
    if (sheet && db.anims[`${sheet}_portrait`]) return portraitHtml(db, sheet, art, 1.2);
    const icon = `systemUI/weapbox_icon_D_${bp.icon}.png`;
    return bp.icon && hasImg(icon) ? `<img class="drone-art" src="/assets/img/${esc(icon)}">` : `<div class="ph-weapon">D</div>`;
  }
  const f = [`ship/drones/${bp.image}_base.png`, `ship/drones/${bp.image}_off.png`].find(hasImg);
  if (!f) return `<div class="ph-weapon">D</div>`;
  return `<img class="drone-art" src="/assets/img/${esc(f)}" onerror="this.style.visibility='hidden'">`;
}

export function sysIconHtml(id: string, art: boolean): string {
  return art ? `<img class="sysicon" src="/assets/img/icons/s_${esc(id)}.png">` : `<span class="sysicon ph">${esc(id.slice(0, 2).toUpperCase())}</span>`;
}
