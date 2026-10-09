/**
 * FTL's own sound effects and music from /assets/audio/ (when extracted); silent otherwise.
 * - play(): one-shot effects.
 * - loop(): named ambient loops (fire, air leak, repair, healing) switched on/off every frame.
 * - music(): one track at a time, crossfaded.
 */
import type { GameDB } from "@ftl/data";

const cache = new Map<string, HTMLAudioElement | null>();
let sfxOn = true;
let musicOn = true;
try {
  sfxOn = localStorage.getItem("ftl-arena-sfx") !== "0";
  musicOn = localStorage.getItem("ftl-arena-music") !== "0";
} catch {}
export const setSound = (on: boolean) => {
  sfxOn = on;
  try {
    localStorage.setItem("ftl-arena-sfx", on ? "1" : "0");
  } catch {}
  if (!on) for (const l of loops.values()) l.pause();
};
export const soundOn = () => sfxOn;

function load(file: string): HTMLAudioElement | null {
  let a = cache.get(file);
  if (a === undefined) {
    a = new Audio(file);
    a.onerror = () => cache.set(file, null);
    cache.set(file, a);
  }
  return a;
}

export function play(db: GameDB, names: string[] | undefined, gain = 1): void {
  if (!sfxOn || !names?.length) return;
  const name = names[Math.floor(Math.random() * names.length)];
  const s = db.sounds[name];
  if (!s) return;
  const a = load(`/assets/audio/waves/${s.file}`);
  if (!a) return;
  const n = a.cloneNode() as HTMLAudioElement;
  n.volume = Math.max(0, Math.min(1, (s.volume / 10) * 0.6 * gain));
  void n.play().catch(() => {});
}

const loops = new Map<string, HTMLAudioElement>();
/** Keep a looping effect playing while `on` (call every frame or on state changes). */
export function loop(db: GameDB, name: string, on: boolean, gain = 1): void {
  let a = loops.get(name);
  if (!on || !sfxOn) {
    if (a && !a.paused) a.pause();
    return;
  }
  const s = db.sounds[name];
  if (!s) return;
  if (!a) {
    a = new Audio(`/assets/audio/waves/${s.file}`);
    a.loop = true;
    loops.set(name, a);
  }
  a.volume = Math.max(0, Math.min(1, (s.volume / 10) * 0.5 * gain));
  if (a.paused) void a.play().catch(() => {});
}
export function stopLoops(): void {
  for (const a of loops.values()) a.pause();
}

let current: { file: string; el: HTMLAudioElement } | null = null;
const MUSIC_VOL = 0.45;
/** Play a music file (under audio/music/) on loop with a short crossfade; null stops music. */
export function music(file: string | null): void {
  if (current?.file === file) {
    if (musicOn && current.el.paused) void current.el.play().catch(() => {});
    return;
  }
  const old = current;
  current = null;
  if (old) fade(old.el, 0, () => old.el.pause());
  if (!file) return;
  const el = new Audio(`/assets/audio/music/${file}`);
  el.loop = true;
  el.volume = 0;
  current = { file, el };
  if (musicOn) {
    void el.play().catch(() => {
      // Autoplay is blocked until the first click; start then.
      const go = () => {
        if (current?.el === el && musicOn) void el.play().then(() => fade(el, MUSIC_VOL)).catch(() => {});
        window.removeEventListener("pointerdown", go);
      };
      window.addEventListener("pointerdown", go);
    });
    fade(el, MUSIC_VOL);
  }
}
export const musicEnabled = () => musicOn;
export function setMusic(on: boolean): void {
  musicOn = on;
  try {
    localStorage.setItem("ftl-arena-music", on ? "1" : "0");
  } catch {}
  if (!current) return;
  if (on) {
    void current.el.play().catch(() => {});
    fade(current.el, MUSIC_VOL);
  } else current.el.pause();
}

function fade(el: HTMLAudioElement, to: number, done?: () => void): void {
  const from = el.volume;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 1200);
    el.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

/** The battle track setting: "" = random, "off", or a track name from sounds.xml. */
export function battleTrackSetting(): string {
  try {
    return localStorage.getItem("ftl-arena-battle-music") ?? "";
  } catch {
    return "";
  }
}
export function setBattleTrack(v: string): void {
  try {
    localStorage.setItem("ftl-arena-battle-music", v);
  } catch {}
}
export function pickBattleTrack(db: GameDB, seed: number): string | null {
  const v = battleTrackSetting();
  if (v === "off") return null;
  const combat = db.music.filter((t) => t.combat);
  const t = combat.find((x) => x.name === v) ?? combat[Math.abs(seed) % Math.max(1, combat.length)];
  return t?.combat ?? null;
}
