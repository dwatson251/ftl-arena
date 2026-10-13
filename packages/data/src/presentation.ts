/**
 * What the player's own FTL install adds to the arena's content: art metadata (animation sheets), sounds and
 * music, the crew name pool, and FTL's own words (titles and descriptions, by text id). The rules, ships and
 * layouts come from packages/content; nothing here changes how a match plays.
 */
import { kids, parseXml, txt, walk } from "./xml.ts";
import { parseAnimations, parseText, type FileSource } from "./parse.ts";
import type { GameDB } from "./types.ts";

export interface Presentation {
  /** FTL's text tables (text_blueprints.xml + text_misc.xml), by id. */
  text: Record<string, string>;
  animSheets: GameDB["animSheets"];
  weaponAnims: GameDB["weaponAnims"];
  anims: GameDB["anims"];
  sounds: GameDB["sounds"];
  music: GameDB["music"];
  names: string[];
  femaleNames: string[];
}

/** The presentation from an install's data files, or null when there's no install. */
export function buildPresentation(read: FileSource): Presentation | null {
  if (!read("data/animations.xml") && !read("data/text_blueprints.xml")) return null;
  const p: Presentation = {
    text: { ...parseText(read("data/text_blueprints.xml") ?? ""), ...parseText(read("data/text_misc.xml") ?? "") },
    animSheets: {}, weaponAnims: {}, anims: {}, sounds: {}, music: [], names: [], femaleNames: [],
  };
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
  const names = read("data/names.xml");
  if (names) {
    const x = parseXml(names);
    p.names = [...new Set(walk(x, "name").map((n) => n.text.trim()).filter((n) => /^[A-Za-z][A-Za-z .'-]{1,13}$/.test(n)))];
    p.femaleNames = [...new Set(walk(x, "nameList").filter((l) => l.attrs.sex === "female" && !l.attrs.language).flatMap((l) => kids(l, "name").map((n) => n.text.trim())))];
  }
  return p;
}
