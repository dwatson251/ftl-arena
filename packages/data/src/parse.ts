/** Builds a GameDB from FTL's own data files (blueprints.xml, ship layouts, animations, text). */
import { kid, kids, num, parseXml, txt, walk, type XNode } from "./xml.ts";
import type {
  DroneBP, WeaponMount, Anim, AnimSheet, CrewBP, GameDB, ShipBP, ShipLayout, ShipSystemSlot, SystemBP, SystemId, WeaponAnim, WeaponBP,
  WeaponType,
} from "./types.ts";

/** Reads one data file by its path inside ftl.dat ("data/blueprints.xml"); undefined when missing. */
export type FileSource = (path: string) => string | undefined;

const WEAPON_TYPES = new Set(["LASER", "MISSILES", "BEAM", "BOMB", "BURST"]);
const SYSTEM_IDS = new Set<string>([
  "shields", "engines", "oxygen", "weapons", "medbay", "pilot", "sensors", "doors", "drones", "teleporter",
  "cloaking", "battery", "mind", "hacking", "clonebay", "artillery",
]);

export function parseText(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of walk(parseXml(xml), "text")) if (t.attrs.name) out[t.attrs.name] = t.text.trim();
  return out;
}

function title(n: XNode, tag: string, text: Record<string, string>): string {
  const k = kid(n, tag);
  if (!k) return "";
  if (k.attrs.id) return text[k.attrs.id] ?? k.attrs.id;
  return k.text.trim();
}

export function parseWeapon(n: XNode, text: Record<string, string>): WeaponBP | undefined {
  const type = txt(n, "type") ?? "";
  if (!WEAPON_TYPES.has(type)) return undefined;
  // Flak lists its pieces under <projectiles>; "fake" pieces are cosmetic.
  const real = kids(kid(n, "projectiles"), "projectile").filter((p) => p.attrs.fake !== "true");
  const pieces = real.reduce((a, p) => a + (Number(p.attrs.count) || 1), 0);
  // Each real piece's art (debris_large, debris_med...), one entry per piece.
  const pieceArt = real.flatMap((p) => Array.from({ length: Number(p.attrs.count) || 1 }, () => p.text.trim())).filter(Boolean);
  const boost = kid(n, "boost");
  return {
    id: n.attrs.name,
    title: title(n, "title", text) || n.attrs.name,
    short: title(n, "short", text) || undefined,
    type: type as WeaponType,
    damage: num(n, "damage"),
    shots: type === "BURST" && pieces > 0 ? pieces : num(n, "shots", 1) || 1,
    sp: num(n, "sp"),
    fireChance: num(n, "fireChance"),
    breachChance: num(n, "breachChance"),
    stunChance: num(n, "stunChance"),
    ion: num(n, "ion"),
    sysDamage: num(n, "sysDamage"),
    persDamage: num(n, "persDamage"),
    hullBust: num(n, "hullBust") > 0,
    lockdown: num(n, "lockdown") > 0,
    cooldown: num(n, "cooldown", 10),
    power: num(n, "power", 1),
    cost: num(n, "cost"),
    missiles: num(n, "missiles"),
    length: num(n, "length"),
    radius: num(n, "radius"),
    speed: num(n, "speed"),
    stun: num(n, "stun"),
    image: txt(n, "image") ?? "",
    ...(pieceArt.length ? { pieceArt } : {}),
    weaponArt: txt(n, "weaponArt") ?? "",
    rarity: num(n, "rarity"),
    chargeLevels: Math.max(1, num(n, "chargeLevels", 1)),
    boost: boost
      ? { type: txt(boost, "type") === "damage" ? "damage" : "cooldown", amount: num(boost, "amount"), count: num(boost, "count") }
      : undefined,
    // Beams: their <color> (FTL draws red without one).
    ...(kid(n, "color") ? { color: [num(kid(n, "color")!, "r"), num(kid(n, "color")!, "g"), num(kid(n, "color")!, "b")] as [number, number, number] } : {}),
    sounds: {
      launch: kids(kid(n, "launchSounds"), "sound").map((x) => x.text.trim()),
      hit: kids(kid(n, "hitShipSounds"), "sound").map((x) => x.text.trim()),
      shield: kids(kid(n, "hitShieldSounds"), "sound").map((x) => x.text.trim()),
      miss: kids(kid(n, "missSounds"), "sound").map((x) => x.text.trim()),
    },
  };
}

export function parseSystem(n: XNode): SystemBP | undefined {
  const id = n.attrs.name;
  if (!SYSTEM_IDS.has(id)) return undefined;
  return {
    id: id as SystemId,
    maxPower: num(n, "maxPower", 1),
    startPower: num(n, "startPower", 1),
    upgradeCost: kids(kid(n, "upgradeCost"), "level").map((l) => Number(l.text.trim()) || 0),
    cost: num(n, "cost"),
  };
}

/**
 * Which "System level info" line of text_misc.xml FTL shows for each level of a system. A string is a fixed
 * key per level (`door_1`...), a function picks one by level; templates keep their \1 / \2 placeholders.
 */
const LEVEL_TEXT: Record<string, (lv: number) => string | undefined> = {
  shields: (lv) => (lv % 2 === 0 ? `shields_${lv / 2 - 1}` : undefined),
  doors: (lv) => `door_${lv}`,
  pilot: (lv) => `pilot_${lv}`,
  sensors: (lv) => `sensor_${lv}`,
  mind: (lv) => `mind_${lv}`,
  artillery: (lv) => `artillery_${lv}`,
  cloaking: () => "cloak",
  teleporter: () => "teleporter_on",
  engines: () => "engine",
  medbay: () => "medbay_healing",
  oxygen: () => "oxygen_on",
  hacking: () => "hacking_duration",
  battery: () => "battery_power",
  clonebay: () => "clone",
  weapons: (lv) => (lv > 1 ? "system_power" : undefined),
  drones: (lv) => (lv > 1 ? "system_power" : undefined),
};

/** FTL's title, description and per-level lines for a system blueprint. */
function systemText(s: SystemBP, n: XNode, text: Record<string, string>): Partial<SystemBP> {
  const pick = LEVEL_TEXT[s.id];
  const levels = Array.from({ length: s.maxPower }, (_, i) => {
    const k = pick?.(i + 1);
    return (k && text[k]) || "";
  });
  return { title: title(n, "title", text) || undefined, desc: title(n, "desc", text) || undefined, levels: levels.some(Boolean) ? levels : undefined };
}

export function parseCrew(n: XNode, text: Record<string, string>): CrewBP {
  const c = kid(kids(kid(n, "colorList"), "layer")[0], "color");
  const shirt = c ? ((+c.attrs.r & 255) << 16) | ((+c.attrs.g & 255) << 8) | (+c.attrs.b & 255) : undefined;
  return { id: n.attrs.name, title: title(n, "title", text) || n.attrs.name, cost: num(n, "cost", 50), shirt, rarity: num(n, "rarity", 1) };
}

const MANNED = new Set(["pilot", "shields", "weapons", "engines", "sensors", "doors"]);

export function parseShip(n: XNode, text: Record<string, string>): ShipBP {
  const systems: ShipSystemSlot[] = [];
  let guns = 0;
  for (const s of kid(n, "systemList")?.children ?? []) {
    if (!SYSTEM_IDS.has(s.tag)) continue;
    // Extra artillery (the flagship has four) become artillery2..4.
    const id = (s.tag === "artillery" ? (++guns > 1 ? `artillery${guns}` : "artillery") : s.tag) as SystemId;
    const slotNum = kid(kid(s, "slot"), "number");
    const dir = kid(kid(s, "slot"), "direction")?.text.trim();
    // -2 = a manned system with no <slot>: resolved later from rooms.xml (the interior's computer). The medbay
    // and clone bay's <slot> is the tile their equipment blocks (FTL's default: tile 1; -2 = none).
    const bay = s.tag === "medbay" || s.tag === "clonebay";
    const station = slotNum ? Number(slotNum.text.trim()) : MANNED.has(s.tag) ? -2 : bay ? 1 : -1;
    systems.push({
      id,
      room: Number(s.attrs.room),
      power: Number(s.attrs.power) || 1,
      start: s.attrs.start !== "false",
      station: MANNED.has(s.tag) || bay ? station : -1,
      img: s.attrs.img,
      weapon: s.attrs.weapon,
      max: s.attrs.max ? Number(s.attrs.max) : undefined,
      facing: (["up", "down", "left", "right"].includes(dir ?? "") ? dir : undefined) as ShipSystemSlot["facing"],
    });
  }
  const wl = kid(n, "weaponList");
  // Hulls list one <crewCount> per race (the Osprey has four); v1 crews are all human, so sum them.
  const crews = kids(n, "crewCount");
  const cls = title(n, "class", text);
  const letter = /_3$/.test(n.attrs.name) ? "C" : /_2$/.test(n.attrs.name) ? "B" : "A";
  return {
    id: n.attrs.name,
    title: title(n, "name", text) || cls || n.attrs.name,
    className: n.attrs.name.startsWith("PLAYER_SHIP_") ? `${cls || "Cruiser"} · Type ${letter}` : cls,
    artDir: n.attrs.name.startsWith("PLAYER_SHIP_") ? "ship" : "ships_glow",
    layout: n.attrs.layout,
    img: n.attrs.img,
    systems,
    weaponSlots: num(n, "weaponSlots", 4),
    weapons: kids(wl, "weapon").map((w) => w.attrs.name),
    missiles: Number(wl?.attrs.missiles ?? 0) || 0,
    health: Number(kid(n, "health")?.attrs.amount ?? 30),
    maxPower: Number(kid(n, "maxPower")?.attrs.amount ?? 8),
    crewCount: crews.length ? crews.reduce((a, c) => a + (Number(c.attrs.amount) || 0), 0) : 3,
    crewRace: crews[0]?.attrs.class ?? "human",
    augments: kids(n, "aug").map((a) => a.attrs.name).filter(Boolean),
    droneSlots: num(n, "droneSlots", 0),
    drones: kids(kid(n, "droneList"), "drone").map((d) => d.attrs.name).filter(Boolean),
    droneParts: Number(kid(n, "droneList")?.attrs.drones ?? 0) || 0,
    crewRaces: crews.length
      ? crews.flatMap((c) => Array.from({ length: Number(c.attrs.amount) || 0 }, () => c.attrs.class || "human"))
      : ["human", "human", "human"],
  };
}

/** Ship layout: the .txt grid (rooms, doors, offsets) plus the .xml art offsets and mounts. */
export function parseLayout(id: string, txtSrc: string, xmlSrc: string | undefined): ShipLayout {
  const tok = txtSrc.split(/\s+/).filter(Boolean);
  const L: ShipLayout = {
    id, xOffset: 0, yOffset: 0, rooms: [], doors: [], img: { x: 0, y: 0, w: 0, h: 0 }, floor: { x: 0, y: 0 },
    mounts: [], ellipse: { a: 0, b: 0, x: 0, y: 0 }, gibs: [],
  };
  for (let i = 0; i < tok.length; ) {
    const k = tok[i++];
    const nx = () => Number(tok[i++]);
    if (k === "X_OFFSET") L.xOffset = nx();
    else if (k === "Y_OFFSET") L.yOffset = nx();
    else if (k === "VERTICAL") nx();
    else if (k === "HORIZONTAL") nx();
    else if (k === "ELLIPSE") L.ellipse = { a: nx(), b: nx(), x: nx(), y: nx() };
    else if (k === "ROOM") L.rooms.push({ id: nx(), x: nx(), y: nx(), w: nx(), h: nx() });
    else if (k === "DOOR") L.doors.push({ x: nx(), y: nx(), a: nx(), b: nx(), vertical: nx() === 1 });
  }
  L.rooms.sort((a, b) => a.id - b.id);
  if (xmlSrc) {
    const x = parseXml(xmlSrc);
    const img = walk(x, "img")[0];
    if (img) L.img = { x: +img.attrs.x || 0, y: +img.attrs.y || 0, w: +img.attrs.w || 0, h: +img.attrs.h || 0 };
    const floor = walk(x, "floor")[0];
    if (floor) L.floor = { x: +floor.attrs.x || 0, y: +floor.attrs.y || 0 };
    L.mounts = walk(x, "mount").map((m) => ({
      x: +m.attrs.x || 0, y: +m.attrs.y || 0, rotate: m.attrs.rotate === "true", mirror: m.attrs.mirror === "true",
      slide: (["up", "down", "left", "right"].includes(m.attrs.slide) ? m.attrs.slide : "") as WeaponMount["slide"],
    }));
    const ex = walk(x, "explosion")[0];
    const range = (g: XNode, t: string): [number, number] => {
      const k = kid(g, t);
      return [Number(k?.attrs.min ?? 0) || 0, Number(k?.attrs.max ?? 0) || 0];
    };
    for (const g of ex?.children ?? []) {
      const m = /^gib(\d+)$/.exec(g.tag);
      if (!m) continue;
      L.gibs.push({
        n: Number(m[1]), x: num(g, "x"), y: num(g, "y"), velocity: range(g, "velocity"), direction: range(g, "direction"),
        angular: range(g, "angular"),
      });
    }
  }
  return L;
}

export function parseAnimations(xml: string, db: Pick<GameDB, "animSheets" | "weaponAnims" | "anims">): void {
  const root = parseXml(xml);
  const top = root.children.length === 1 && root.children[0].tag === "FTL" ? root.children[0] : root;
  for (const n of top.children) {
    if (n.tag === "animSheet") {
      db.animSheets[n.attrs.name] = {
        file: n.text.trim(), w: +n.attrs.w, h: +n.attrs.h, fw: +n.attrs.fw, fh: +n.attrs.fh,
      } satisfies AnimSheet;
    } else if (n.tag === "weaponAnim") {
      const d = kid(n, "desc");
      const fp = kid(n, "firePoint");
      const mp = kid(n, "mountPoint");
      db.weaponAnims[n.attrs.name] = {
        sheet: txt(n, "sheet") ?? "", sheetDef: db.animSheets[txt(n, "sheet") ?? ""], frames: +(d?.attrs.length ?? 1), chargedFrame: num(n, "chargedFrame"),
        fireFrame: num(n, "fireFrame"), firePoint: { x: +(fp?.attrs.x ?? 0), y: +(fp?.attrs.y ?? 0) },
        mountPoint: { x: +(mp?.attrs.x ?? 0), y: +(mp?.attrs.y ?? 0) },
        boost: txt(n, "boost"),
      } satisfies WeaponAnim;
    } else if (n.tag === "anim") {
      const d = kid(n, "desc");
      db.anims[n.attrs.name] = {
        sheet: txt(n, "sheet") ?? "", sheetDef: db.animSheets[txt(n, "sheet") ?? ""], frames: +(d?.attrs.length ?? 1), x: +(d?.attrs.x ?? 0), y: +(d?.attrs.y ?? 0),
        time: num(n, "time", 1),
      } satisfies Anim;
    }
  }
}

/** FTL's stock interior for a system, fitting its room (and its console on the fixed station tile, if any). */
function stockInterior(
  sys: ShipSystemSlot, room: { w: number; h: number } | undefined, computers: Record<string, { x: number; y: number; dir: string }>,
  imageSize: (path: string) => { w: number; h: number } | undefined,
): string | undefined {
  if (!room) return undefined;
  const names = [`room_${sys.id}`, ...Array.from({ length: 20 }, (_, i) => `room_${sys.id}_${i + 2}`)];
  const fits = names.filter((n) => {
    const sz = imageSize(`img/ship/interior/${n}.png`);
    return sz && Math.round(sz.w / 35) === room.w && Math.round(sz.h / 35) === room.h && computers[n.replace(/^room_/, "")];
  });
  if (sys.station < 0) return fits[0];
  return fits.find((n) => {
    const pc = computers[n.replace(/^room_/, "")];
    const tile = Math.floor(pc.y / 35) * room.w + Math.floor(pc.x / 35);
    return tile === sys.station && (!sys.facing || pc.dir.toLowerCase() === sys.facing);
  });
}

/** The Rebel flagship's three stages (BOSS_1..3 in blueprints.xml). */
const FLAGSHIP = /^BOSS_[123]$/;
const RULES_FLAGSHIP_CREW = 8;

/** Player hulls offered in the hangar, in FTL's order. Missing ones (no AE, say) are skipped. */
const HANGAR = [
  "PLAYER_SHIP_HARD", "PLAYER_SHIP_HARD_2", "PLAYER_SHIP_HARD_3", "PLAYER_SHIP_CIRCLE", "PLAYER_SHIP_CIRCLE_2", "PLAYER_SHIP_CIRCLE_3",
  "PLAYER_SHIP_FED", "PLAYER_SHIP_FED_2", "PLAYER_SHIP_FED_3", "PLAYER_SHIP_ENERGY", "PLAYER_SHIP_ENERGY_2", "PLAYER_SHIP_ENERGY_3",
  "PLAYER_SHIP_MANTIS", "PLAYER_SHIP_MANTIS_2", "PLAYER_SHIP_MANTIS_3", "PLAYER_SHIP_JELLY", "PLAYER_SHIP_JELLY_2", "PLAYER_SHIP_JELLY_3",
  "PLAYER_SHIP_ROCK", "PLAYER_SHIP_ROCK_2", "PLAYER_SHIP_ROCK_3", "PLAYER_SHIP_STEALTH", "PLAYER_SHIP_STEALTH_2", "PLAYER_SHIP_STEALTH_3",
  "PLAYER_SHIP_ANAEROBIC", "PLAYER_SHIP_ANAEROBIC_2", "PLAYER_SHIP_CRYSTAL", "PLAYER_SHIP_CRYSTAL_2",
];

/**
 * Load order mirrors the game: blueprints.xml, then dlcBlueprints.xml, then dlcBlueprintsOverwrite.xml;
 * later definitions win.
 */
export function buildDbFromFtl(read: FileSource, imageSize?: (path: string) => { w: number; h: number } | undefined): GameDB {
  const text = { ...parseText(read("data/text_blueprints.xml") ?? ""), ...parseText(read("data/text_misc.xml") ?? "") };
  const db: GameDB = {
    source: "ftl", weapons: {}, systems: {}, crew: {}, ships: {}, layouts: {}, animSheets: {}, weaponAnims: {},
    anims: {}, sounds: {}, names: [], hangar: [], enemies: [], music: [], augments: {}, droneBPs: {},
  };
  db.reactorDesc = text.reactor_desc;
  const lists: Record<string, string[]> = {};
  const enemyNodes: XNode[] = [];
  for (const f of ["data/blueprints.xml", "data/dlcBlueprints.xml", "data/dlcBlueprintsOverwrite.xml", "data/autoBlueprints.xml"]) {
    const src = read(f);
    if (!src) continue;
    const root = parseXml(src);
    const top = root.children.find((c) => c.tag === "FTL") ?? root;
    for (const n of top.children) {
      if (n.tag === "weaponBlueprint") {
        const w = parseWeapon(n, text);
        if (w) db.weapons[w.id] = w;
      } else if (n.tag === "systemBlueprint") {
        const s = parseSystem(n);
        if (s) db.systems[s.id] = { ...s, ...systemText(s, n, text) };
      } else if (n.tag === "crewBlueprint") db.crew[n.attrs.name] = parseCrew(n, text);
      else if (n.tag === "shipBlueprint" && n.attrs.name?.startsWith("PLAYER_SHIP_")) {
        db.ships[n.attrs.name] = parseShip(n, text);
      } else if (n.tag === "augBlueprint" && n.attrs.name && kid(n, "title")?.attrs.id) {
        db.augments[n.attrs.name] = {
          id: n.attrs.name, title: title(n, "title", text), desc: title(n, "desc", text) || text[`aug_${n.attrs.name}_desc`] || "",
          cost: num(n, "cost"), value: parseFloat(txt(n, "value") ?? "0") || 0, stackable: txt(n, "stackable") === "true",
          rarity: num(n, "rarity"),
        };
      } else if (n.tag === "droneBlueprint" && n.attrs.name) {
        const type = (txt(n, "type") ?? "") as DroneBP["type"];
        db.droneBPs[n.attrs.name] = {
          id: n.attrs.name, title: title(n, "title", text) || n.attrs.name, type, power: num(n, "power", 1), cost: num(n, "cost"),
          cooldown: num(n, "cooldown", 1000) / 1000, speed: num(n, "speed", 10), weapon: txt(n, "weaponBlueprint") ?? "",
          image: txt(n, "droneImage") ?? "", icon: txt(n, "iconImage") ?? "", rarity: num(n, "rarity"), antiDrone: n.attrs.name === "ANTI_DRONE",
        };
      } else if (n.tag === "blueprintList" && n.attrs.name) lists[n.attrs.name] = kids(n, "name").map((x) => x.text.trim());
      else if (n.tag === "shipBlueprint" && n.attrs.name && n.attrs.layout && (f.includes("Blueprints") || FLAGSHIP.test(n.attrs.name))) enemyNodes.push(n);
    }
  }
  for (const id of HANGAR) {
    const s = db.ships[id];
    if (!s) continue;
    const t = read(`data/${s.layout}.txt`);
    if (!t) continue;
    db.layouts[s.layout] = parseLayout(s.layout, t, read(`data/${s.layout}.xml`));
    db.hangar.push(id);
  }
  // Single-player enemies (autoBlueprints): weapons come from a named pool, crew from amount..max.
  for (const n of enemyNodes) {
    const id = n.attrs.name;
    // The Rebel flagship's three stages and the automated (crewless) ships are in; other bosses and the DLC
    // re-tunes of the same hulls are skipped.
    const flagship = FLAGSHIP.test(id);
    if (db.ships[id] || (!flagship && /BOSS|FLAGSHIP|DRONE_|_PEACE|_DLC$/.test(id))) continue;
    const wl = kid(n, "weaponList");
    const pool = (wl?.attrs.load ? lists[wl.attrs.load] : undefined) ?? kids(wl, "weapon").map((w) => w.attrs.name);
    const s = parseShip(n, text);
    const crew = kids(n, "crewCount")[0];
    s.enemy = true;
    if (/^AUTO_/.test(id)) s.auto = true;
    s.weaponPool = (pool ?? []).filter((w) => db.weapons[w]);
    s.crewMax = Number(crew?.attrs.max ?? s.crewCount) || s.crewCount;
    s.weaponSlots = 4;
    if (flagship) {
      // Its guns are artillery rooms; its crew comes from events in FTL, so it gets a fixed one here.
      s.title = `${s.className || "Rebel Flagship"} (stage ${id.slice(-1)})`;
      s.crewCount = s.crewMax = RULES_FLAGSHIP_CREW;
      s.crewRaces = Array.from({ length: RULES_FLAGSHIP_CREW }, () => "human");
      // Its normal-difficulty layout (boss_N_easy): the weapon rooms stand apart from the main ship, reached
      // only by teleporting. The plain boss_N is Hard mode's, with corridors joining the laser and missile rooms.
      if (read(`data/${s.layout}_easy.txt`)) {
        // Hard mode's layout stays available as BOSS_N_HARD (picked by high bot difficulty).
        const hardLayout = s.layout;
        const ht = read(`data/${hardLayout}.txt`);
        if (ht) {
          db.layouts[hardLayout] ??= parseLayout(hardLayout, ht, read(`data/${hardLayout}.xml`));
          db.ships[`${id}_HARD`] = { ...s, id: `${id}_HARD`, layout: hardLayout, title: `${s.title} (hard)` };
        }
        s.layout = `${s.layout}_easy`;
      }
    } else if (!s.weaponPool.length && !s.weapons.length) continue;
    const t = read(`data/${s.layout}.txt`);
    if (!t) continue;
    db.layouts[s.layout] ??= parseLayout(s.layout, t, read(`data/${s.layout}.xml`));
    db.ships[id] = s;
    db.enemies.push(id);
  }
  // Default stations: rooms.xml gives each interior image's computer position and facing.
  const roomXml = read("data/rooms.xml");
  const computers: Record<string, { x: number; y: number; dir: string }> = {};
  if (roomXml)
    for (const r of walk(parseXml(roomXml), "roomLayout")) {
      const cg = kid(r, "computerGlow");
      if (cg) computers[r.attrs.name] = { x: Number(cg.attrs.x) || 0, y: Number(cg.attrs.y) || 0, dir: (cg.attrs.dir ?? "UP").toLowerCase() };
    }
  for (const s of Object.values(db.ships)) {
    const L = db.layouts[s.layout];
    for (const sys of s.systems) {
      // A player hull's manned system with no interior named gets FTL's stock one for its room's shape
      // (room_pilot, room_engines_3...), so its computer is drawn and its station sits at that console. When
      // the blueprint fixes the station (<slot>), only an interior whose console is on that tile will do.
      if (!sys.img && imageSize && !s.enemy && MANNED.has(sys.id)) sys.img = stockInterior(sys, L?.rooms.find((r) => r.id === sys.room), computers, imageSize);
      const pc = sys.img ? computers[sys.img.replace(/^room_/, "")] : undefined;
      // A <slot> without a <direction>: face the interior's computer.
      const bay = sys.id === "medbay" || sys.id === "clonebay";
      if (sys.station >= 0 && !sys.facing && pc && !bay) sys.facing = pc.dir as ShipSystemSlot["facing"];
      if (sys.station !== -2 || bay) continue;
      const room = L?.rooms.find((r) => r.id === sys.room);
      if (room && pc) {
        const tx = Math.max(0, Math.min(room.w - 1, Math.floor(pc.x / 35)));
        const ty = Math.max(0, Math.min(room.h - 1, Math.floor(pc.y / 35)));
        sys.station = ty * room.w + tx;
        sys.facing ??= pc.dir as ShipSystemSlot["facing"];
      } else sys.station = 0;
    }
  }
  for (const f of ["data/animations.xml", "data/dlcAnimations.xml"]) {
    const src = read(f);
    if (src) parseAnimations(src, db);
  }
  for (const f of ["data/sounds.xml", "data/dlcSounds.xml"]) {
    const src = read(f);
    if (!src) continue;
    const root = parseXml(src);
    const top = root.children.find((c) => c.tag === "FTL") ?? root;
    for (const n of top.children) {
      if (n.tag === "music") {
        for (const t of kids(n, "track")) db.music.push({ name: txt(t, "name") ?? "", explore: txt(t, "explore"), combat: txt(t, "combat") });
        continue;
      }
      if (!/\.(ogg|wav)$/.test(n.text.trim())) continue;
      db.sounds[n.tag] = { file: n.text.trim(), volume: Number(n.attrs.volume ?? 5) || 5 };
    }
  }
  const names = read("data/names.xml");
  if (names) db.names = [...new Set(walk(parseXml(names), "name").map((n) => n.text.trim()).filter((n) => /^[A-Za-z][A-Za-z .'-]{1,13}$/.test(n)))];
  if (names)
    db.femaleNames = [...new Set(walk(parseXml(names), "nameList").filter((l) => l.attrs.sex === "female" && !l.attrs.language).flatMap((l) => kids(l, "name").map((n) => n.text.trim())))];
  return db;
}
