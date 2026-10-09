/** FTL's own sound effects from /assets/audio/waves/, when extracted. Silent otherwise. */
import type { GameDB } from "@ftl/data";

const cache = new Map<string, HTMLAudioElement | null>();
let enabled = true;
export const setSound = (on: boolean) => (enabled = on);
export const soundOn = () => enabled;

export function play(db: GameDB, names: string[] | undefined, gain = 1): void {
  if (!enabled || !names?.length) return;
  const name = names[Math.floor(Math.random() * names.length)];
  const s = db.sounds[name];
  if (!s) return;
  let a = cache.get(s.file);
  if (a === undefined) {
    a = new Audio(`/assets/audio/waves/${s.file}`);
    a.onerror = () => cache.set(s.file, null);
    cache.set(s.file, a);
  }
  if (!a) return;
  const n = a.cloneNode() as HTMLAudioElement;
  n.volume = Math.max(0, Math.min(1, (s.volume / 10) * 0.6 * gain));
  void n.play().catch(() => {});
}
