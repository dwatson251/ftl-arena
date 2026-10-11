/**
 * Ship presets: saved hangar builds on this computer. The desktop app keeps them in its data folder
 * (presets.json, through the preload bridge: the page's localhost origin changes with the port, which would
 * strand localStorage); a plain browser uses localStorage. A broken store reads as "no presets".
 */
import type { Loadout } from "@ftl/sim";

/** The random backdrop a preset's snapshot is drawn on, picked once when it's saved. */
export interface PresetLook {
  bg: string;
  planet?: string;
  /** Crop offsets into the background (0..1) and a horizontal flip. */
  x: number;
  y: number;
  flip: boolean;
}

export interface Preset {
  id: string;
  name: string;
  loadout: Loadout;
  look: PresetLook;
  savedAt: number;
  /** The Scrap costs mode it was built under ("none" for presets from before there were any). */
  costs?: "none" | "ships" | "tournament";
}

export interface PresetBackend {
  load(): Promise<unknown> | unknown;
  save(list: Preset[]): Promise<void> | void;
}

const BGS = ["bg_blueStarcluster", "bg_darknebula", "bg_dullstars", "bg_dullstars2", "bg_lonelyRedStar", "bg_lonelystar"];
const PLANETS = ["planet_bigblue", "planet_brown", "planet_gas_blue", "planet_gas_yellow", "planet_peach", "planet_red", "planet_populated_brown", "planet_populated_dark", "planet_populated_orange"];

const KEY = "ftl-arena-presets";

/** The desktop app's bridge if there is one, else this browser's localStorage. */
function defaultBackend(): PresetBackend {
  const bridge = (globalThis as unknown as { ftlArena?: { presets?: PresetBackend } }).ftlArena?.presets;
  if (bridge) return bridge;
  return {
    load: () => {
      try {
        return JSON.parse(localStorage.getItem(KEY) ?? "[]");
      } catch {
        return [];
      }
    },
    save: (list) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
      } catch {}
    },
  };
}

const valid = (p: unknown): p is Preset => {
  const q = p as Preset;
  return !!q && typeof q.id === "string" && typeof q.name === "string" && !!q.loadout && typeof q.loadout.ship === "string" && !!q.look && typeof q.look.bg === "string";
};

/** A random snapshot backdrop. */
export function randomLook(rnd: () => number = Math.random): PresetLook {
  return {
    bg: BGS[Math.floor(rnd() * BGS.length)],
    planet: rnd() < 0.6 ? PLANETS[Math.floor(rnd() * PLANETS.length)] : undefined,
    x: Math.round(rnd() * 100) / 100,
    y: Math.round(rnd() * 100) / 100,
    flip: rnd() < 0.5,
  };
}

/** The parts of a loadout a player chose (key order and absent-vs-empty don't matter). */
function norm(l: Loadout): string {
  const sys = Object.entries(l.systems ?? {}).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([l.ship, sys, l.reactor, l.weapons, l.crew.map((c) => [c.name, c.race, Object.entries(c.xp ?? {}).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b))]), l.missiles, l.augments ?? [], l.drones ?? [], l.droneParts ?? 0]);
}

export const isSame = (a: Loadout, b: Loadout): boolean => norm(a) === norm(b);
export const copyName = (name: string): string => `${name} - Copy`;

export class PresetStore {
  private items: Preset[] = [];
  private ready: Promise<void> | null = null;

  constructor(private backend: PresetBackend = defaultBackend()) {}

  /** Read the saved presets once (before the first menu). */
  init(): Promise<void> {
    this.ready ??= (async () => {
      try {
        const raw = await this.backend.load();
        this.items = Array.isArray(raw) ? raw.filter(valid) : [];
      } catch {
        this.items = [];
      }
    })();
    return this.ready;
  }

  /** Newest first. With `costs`, only those built under that Scrap costs mode, plus FTL-save ships (valid in any). */
  list(costs?: "none" | "ships" | "tournament"): Preset[] {
    const fits = (p: Preset) => costs === undefined || p.loadout.origin === "ftl" || (p.costs ?? "none") === costs;
    return this.items.filter(fits).sort((a, b) => b.savedAt - a.savedAt);
  }

  get(id: string): Preset | undefined {
    return this.items.find((p) => p.id === id);
  }

  /** Save a new preset (never overwrites), with its own random backdrop. */
  save(name: string, loadout: Loadout, rnd: () => number = Math.random, costs: "none" | "ships" | "tournament" = "none"): Preset {
    const p: Preset = {
      id: `${Date.now().toString(36)}${Math.floor(rnd() * 1e9).toString(36)}`,
      name: name.trim().slice(0, 40) || "Unnamed ship",
      loadout: structuredClone(loadout),
      look: randomLook(rnd),
      savedAt: Date.now() + this.items.length * 1e-3,
      costs,
    };
    this.items.push(p);
    this.flush();
    return p;
  }

  remove(id: string): void {
    this.items = this.items.filter((p) => p.id !== id);
    this.flush();
  }

  private flush(): void {
    try {
      void Promise.resolve(this.backend.save(this.items)).catch(() => {});
    } catch {}
  }
}

/** The app's store. */
export const presets = new PresetStore();
