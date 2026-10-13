/**
 * What the player's own FTL install adds to the arena's content: how its art is cut into frames (animation
 * sheets), its sounds and music. Everything else (rules, ships, layouts, words, names) is in packages/content;
 * nothing here changes how a match plays.
 */
import { kids, parseXml, txt } from "./xml.ts";
import { parseAnimations, type FileSource } from "./parse.ts";
import type { GameDB } from "./types.ts";

export interface Presentation {
  animSheets: GameDB["animSheets"];
  weaponAnims: GameDB["weaponAnims"];
  anims: GameDB["anims"];
  sounds: GameDB["sounds"];
  music: GameDB["music"];
}

/** The presentation from an install's data files, or null when there's no install. */
export function buildPresentation(read: FileSource): Presentation | null {
  if (!read("data/animations.xml")) return null;
  const p: Presentation = { animSheets: {}, weaponAnims: {}, anims: {}, sounds: {}, music: [] };
  for (const f of ["data/animations.xml", "data/dlcAnimations.xml"]) {
    const src = read(f);
    if (src) parseAnimations(src, p);
  }
  for (const f of ["data/sounds.xml", "data/dlcSounds.xml"]) {
    const src = read(f);
    if (!src) continue;
    const root = parseXml(src);
    const top = root.children.find((c) => c.tag === "FTL") ?? root;
    for (const n of top.children) {
      if (n.tag === "music") {
        for (const t of kids(n, "track")) p.music.push({ name: txt(t, "name") ?? "", explore: txt(t, "explore"), combat: txt(t, "combat") });
        continue;
      }
      if (!/\.(ogg|wav)$/.test(n.text.trim())) continue;
      p.sounds[n.tag] = { file: n.text.trim(), volume: Number(n.attrs.volume ?? 5) || 5 };
    }
  }
  return p;
}
