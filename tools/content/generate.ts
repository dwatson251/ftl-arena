/**
 * Writes packages/content/src from a local FTL extract: one config class per blueprint (ships with their room
 * layouts and stock loadouts, weapons, drones, augments, crew, systems) plus registry.ts. A one-off bootstrap:
 * the generated files are committed and edited by hand from then on (re-running overwrites them).
 *   npx tsx tools/content/generate.ts [assets-local]
 * FTL's prose (descriptions, level lines) isn't copied: classes keep the text ids, and the player's install
 * supplies the words at runtime (packages/data/src/presentation.ts).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { kid, parseXml, type XNode } from "@ftl/data";
import { loadFtlDb } from "@ftl/extract";
import { AUGMENT_EFFECTS_V1, RACES_V1 } from "./legacy.ts";

const assets = resolve(process.argv[2] ?? "assets-local");
if (!existsSync(join(assets, "data/blueprints.xml"))) throw new Error(`no FTL extract at ${assets} (run npm run extract first)`);
const db = loadFtlDb(assets);
const out = resolve("packages/content/src");

/** A TypeScript literal for v, compact: short objects and arrays on one line, one array item per line. */
const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
function lit(v: unknown, indent = 2): string {
  const pad = " ".repeat(indent);
  const one = (x: unknown): string => {
    if (Array.isArray(x)) return `[${x.map(one).join(", ")}]`;
    if (x && typeof x === "object") {
      const e = Object.entries(x).filter(([, y]) => y !== undefined);
      return e.length ? `{ ${e.map(([k, y]) => `${key(k)}: ${one(y)}`).join(", ")} }` : "{}";
    }
    return JSON.stringify(x);
  };
  const flat = one(v);
  if (flat.length + indent <= 116 || v === null || typeof v !== "object") return flat;
  const inner = " ".repeat(indent + 2);
  if (Array.isArray(v)) return `[\n${v.map((y) => inner + lit(y, indent + 2)).join(",\n")},\n${pad}]`;
  const e = Object.entries(v as object).filter(([, y]) => y !== undefined);
  return `{\n${e.map(([k, y]) => `${inner}${key(k)}: ${lit(y, indent + 2)}`).join(",\n")},\n${pad}}`;
}
const cls = (id: string) => {
  const s = id.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[0-9]/.test(s) ? `_${s}` : s.charAt(0).toUpperCase() + s.slice(1);
};
const comment = (s: string) => s.replace(/\*\//g, "* /");
const file = (dir: string, id: string) => join(out, dir, `${id.replace(/[^A-Za-z0-9_.-]/g, "_")}.ts`);
const write = (p: string, s: string) => writeFileSync(p, s.endsWith("\n") ? s : s + "\n");
const omit = <T extends object>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !keys.includes(k) && v !== undefined));

// Text ids from the blueprints (so the install's text tables can fill in FTL's words).
const blueprints: XNode[] = [];
for (const f of ["data/blueprints.xml", "data/dlcBlueprints.xml", "data/dlcBlueprintsOverwrite.xml", "data/autoBlueprints.xml"]) {
  const p = join(assets, f);
  if (!existsSync(p)) continue;
  const root = parseXml(readFileSync(p, "utf8"));
  blueprints.push(...(root.children.find((c) => c.tag === "FTL") ?? root).children);
}
const node = (tag: string, name: string) => blueprints.filter((n) => n.tag === tag && n.attrs.name === name).pop();
const textId = (n: XNode | undefined, tag: string) => kid(n, tag)?.attrs.id;

for (const d of ["ships", "layouts", "weapons", "drones", "augments", "crew", "systems"]) {
  rmSync(join(out, d), { recursive: true, force: true });
  mkdirSync(join(out, d), { recursive: true });
}
const reg: { kind: string; id: string; path: string }[] = [];

// Layouts (shared between ships that use the same one).
for (const L of Object.values(db.layouts)) {
  write(file("layouts", L.id), `/** Room layout "${L.id}": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = ${lit(L, 0)};
export default layout;`);
}

// Ships.
const hangar = new Set(db.hangar);
const enemies = new Set(db.enemies);
for (const s of Object.values(db.ships)) {
  const L = db.layouts[s.layout];
  if (!L) continue;
  // Hand-tuned shield bubble offsets (playtest).
  const nudge = ({ CIRCLE_BOMBER: { y: 10 }, ZOLTAN_FIGHTER: { y: 10 } } as Record<string, { y: number }>)[s.id];
  const enemy = { scale: 1, ...(nudge ? { shieldNudge: nudge } : {}), ...(s.enemy ? { single: true } : {}), ...(s.auto ? { auto: true } : {}), ...(s.weaponPool ? { weaponPool: s.weaponPool } : {}), ...(s.crewMax !== undefined ? { crewMax: s.crewMax } : {}) };
  const loadout = { crew: s.crewRaces, crewCount: s.crewCount, crewRace: s.crewRace, weapons: s.weapons, drones: s.drones, augments: s.augments, missiles: s.missiles, droneParts: s.droneParts };
  const layoutVar = cls(`L_${L.id}`);
  write(file("ships", s.id), `/** ${comment(s.title)}${s.className ? ` (${comment(s.className)})` : ""}. */
import type { ShipConfig } from "../types.ts";
import ${layoutVar} from "../layouts/${L.id.replace(/[^A-Za-z0-9_.-]/g, "_")}.ts";

export default class ${cls(s.id)} implements ShipConfig {
  readonly id = ${lit(s.id)};
  readonly title = ${lit(s.title)};
  readonly className = ${lit(s.className)};
  readonly health = ${s.health};
  readonly reactor = ${s.maxPower};
  readonly weaponSlots = ${s.weaponSlots};
  readonly droneSlots = ${s.droneSlots};
  readonly systems: ShipConfig["systems"] = ${lit(s.systems)};
  readonly loadout: ShipConfig["loadout"] = ${lit(loadout)};
  readonly layout = ${layoutVar};
  readonly sprites: ShipConfig["sprites"] = ${lit({ dir: s.artDir, img: s.img, floor: s.floorImg, shield: s.shieldImg, cloak: s.cloakImg })};
${hangar.has(s.id) ? "  readonly player = { hangar: true };\n" : ""}  readonly enemy: ShipConfig["enemy"] = ${lit(enemy)};
}`);
  reg.push({ kind: "ship", id: s.id, path: `./ships/${s.id}.ts` });
}

// Weapons, drones.
for (const w of Object.values(db.weapons)) {
  write(file("weapons", w.id), `/** ${comment(w.title)}. */
import type { WeaponConfig } from "../types.ts";

export default class ${cls(w.id)} implements WeaponConfig {
${Object.entries(omit(w, [])).map(([k, v]) => `  readonly ${k}${Array.isArray(v) || (typeof v === "object" && v) ? `: WeaponConfig[${JSON.stringify(k)}]` : ""} = ${lit(v)};`).join("\n")}
}`);
  reg.push({ kind: "weapon", id: w.id, path: `./weapons/${w.id}.ts` });
}
for (const d of Object.values(db.droneBPs)) {
  write(file("drones", d.id), `/** ${comment(d.title)}. */
import type { DroneConfig } from "../types.ts";

export default class ${cls(d.id)} implements DroneConfig {
${Object.entries(omit(d, [])).map(([k, v]) => `  readonly ${k}${typeof v === "string" && k === "type" ? `: DroneConfig["type"]` : ""} = ${lit(v)};`).join("\n")}
}`);
  reg.push({ kind: "drone", id: d.id, path: `./drones/${d.id}.ts` });
}

// Augments: our effect text; FTL's description comes from the install by text id.
for (const a of Object.values(db.augments)) {
  const descId = textId(node("augBlueprint", a.id), "desc") ?? `aug_${a.id}_desc`;
  write(file("augments", a.id), `/** ${comment(a.title)}. */
import type { AugmentConfig } from "../types.ts";

export default class ${cls(a.id)} implements AugmentConfig {
${Object.entries(omit(a, ["desc"])).map(([k, v]) => `  readonly ${k} = ${lit(v)};`).join("\n")}
  /** What it does in the arena ("" = no effect in a 1v1 fight). */
  readonly effect = ${lit(AUGMENT_EFFECTS_V1[a.id] ?? "")};
  /** FTL's description, from the player's install. */
  readonly text = ${lit({ desc: descId })};
}`);
  reg.push({ kind: "augment", id: a.id, path: `./augments/${a.id}.ts` });
}

// Crew races, with their traits in the arena (in the arena's hire order).
const raceOrder = Object.keys(RACES_V1);
const crewList = Object.values(db.crew).sort((a, b) => (raceOrder.indexOf(a.id) + 1 || 99) - (raceOrder.indexOf(b.id) + 1 || 99));
for (const c of crewList) {
  const traits = RACES_V1[c.id] ?? { hp: 100, speed: 1, repair: 1, combat: 1, suffocation: 1, blurb: "" };
  write(file("crew", c.id), `/** ${comment(c.title)}. */
import type { CrewConfig } from "../types.ts";

export default class ${cls(c.id)} implements CrewConfig {
${Object.entries(omit(c, [])).map(([k, v]) => `  readonly ${k} = ${lit(v)};`).join("\n")}
  readonly traits: CrewConfig["traits"] = ${lit(traits)};
}`);
  reg.push({ kind: "crew", id: c.id, path: `./crew/${c.id}.ts` });
}

// Systems: numbers here, FTL's title/description/level lines from the install by text id. A system FTL
// describes inline (no ids) gets its name and our own description.
const OWN_SYSTEM_TEXT: Record<string, { title: string; desc: string }> = {
  artillery: { title: "Artillery Beam", desc: "A slow, heavy beam that ignores shields and hits each room it sweeps for 1 damage. More power charges it faster." },
};
for (const s of Object.values(db.systems)) {
  const n = node("systemBlueprint", s.id);
  const own = OWN_SYSTEM_TEXT[s.id];
  write(file("systems", s.id), `/** The ${s.id} system. */
import type { SystemConfig } from "../types.ts";

export default class ${cls(`Sys_${s.id}`)} implements SystemConfig {
${Object.entries(omit(s, ["title", "desc", "levels"])).map(([k, v]) => `  readonly ${k}${k === "id" ? `: SystemConfig["id"]` : ""} = ${lit(v)};`).join("\n")}
${own ? `  /** FTL writes these inline (no text ids); ours. */
  readonly title = ${lit(own.title)};
  readonly desc = ${lit(own.desc)};` : `  /** FTL's title and description, from the player's install. */
  readonly text = ${lit(omit({ title: textId(n, "title"), desc: textId(n, "desc") }, []))};`}
}`);
  reg.push({ kind: "system", id: s.id, path: `./systems/${s.id}.ts` });
}

// The registry: every class, plus the hangar's and the enemy list's order.
const groups: Record<string, string> = { ship: "SHIPS", weapon: "WEAPONS", drone: "DRONES", augment: "AUGMENTS", crew: "CREW", system: "SYSTEMS" };
const types: Record<string, string> = { ship: "ShipConfig", weapon: "WeaponConfig", drone: "DroneConfig", augment: "AugmentConfig", crew: "CrewConfig", system: "SystemConfig" };
const imports = reg.map((r, i) => `import C${i} from ${JSON.stringify(r.path)};`).join("\n");
const lists = Object.entries(groups)
  .map(([k, name]) => `export const ${name}: ${types[k]}[] = [${reg.map((r, i) => (r.kind === k ? `new C${i}()` : "")).filter(Boolean).join(", ")}];`)
  .join("\n");
write(join(out, "registry.ts"), `/** Every content class (generated by tools/content/generate.ts; add new blueprints here by hand). */
import type { AugmentConfig, CrewConfig, DroneConfig, ShipConfig, SystemConfig, WeaponConfig } from "./types.ts";
${imports}

${lists}
/** Player hulls offered in the hangar, in order. */
export const HANGAR: string[] = ${lit(db.hangar, 0)};
/** Single-player enemy hulls (the practice bot's and Survival's), in order. */
export const ENEMIES: string[] = ${lit(db.enemies, 0)};`);
console.log(`wrote ${reg.length} classes and ${Object.keys(db.layouts).length} layouts to ${out}`);
