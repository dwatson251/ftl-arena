/** Builds a GameDB from FTL's own data files (blueprints.xml, ship layouts, animations, text). */
import { kid, kids, num, parseXml, txt, walk, type XNode } from "./xml.ts";
import type {
  Anim, AnimSheet, CrewBP, GameDB, ShipBP, ShipLayout, ShipSystemSlot, SystemBP, SystemId, WeaponAnim, WeaponBP,
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
  const pieces = kids(kid(n, "projectiles"), "projectile")
    .filter((p) => p.attrs.fake !== "true")
    .reduce((a, p) => a + (Number(p.attrs.count) || 1), 0);
  const boost = kid(n, "boost");
  return {
    id: n.attrs.name,
    title: title(n, "title", text) || n.attrs.name,
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
    cooldown: num(n, "cooldown", 10),
    power: num(n, "power", 1),
    cost: num(n, "cost"),
    missiles: num(n, "missiles"),
    length: num(n, "length"),
    radius: num(n, "radius"),
    speed: num(n, "speed"),
    stun: num(n, "stun"),
    image: txt(n, "image") ?? "",
    weaponArt: txt(n, "weaponArt") ?? "",
    rarity: num(n, "rarity"),
    chargeLevels: Math.max(1, num(n, "chargeLevels", 1)),
    boost: boost
      ? { type: txt(boost, "type") === "damage" ? "damage" : "cooldown", amount: num(boost, "amount"), count: num(boost, "count") }
      : undefined,
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

export function parseCrew(n: XNode, text: Record<string, string>): CrewBP {
  const c = kid(kids(kid(n, "colorList"), "layer")[0], "color");
  const shirt = c ? ((+c.attrs.r & 255) << 16) | ((+c.attrs.g & 255) << 8) | (+c.attrs.b & 255) : undefined;
  return { id: n.attrs.name, title: title(n, "title", text) || n.attrs.name, cost: num(n, "cost", 50), shirt };
}

const MANNED = new Set(["pilot", "shields", "weapons", "engines", "sensors", "doors"]);

export function parseShip(n: XNode, text: Record<string, string>): ShipBP {
  const systems: ShipSystemSlot[] = [];
  for (const s of kid(n, "systemList")?.children ?? []) {
    if (!SYSTEM_IDS.has(s.tag)) continue;
    const slotNum = kid(kid(s, "slot"), "number");
    const station = slotNum ? Number(slotNum.text.trim()) : MANNED.has(s.tag) ? 0 : -1;
    systems.push({
      id: s.tag as SystemId,
      room: Number(s.attrs.room),
      power: Number(s.attrs.power) || 1,
      start: s.attrs.start !== "false",
      station: MANNED.has(s.tag) || s.tag === "medbay" ? station : -1,
      img: s.attrs.img,
    });
  }
  const wl = kid(n, "weaponList");
  // Hulls list one <crewCount> per race (the Osprey has four); v1 crews are all human, so sum them.
  const crews = kids(n, "crewCount");
  return {
    id: n.attrs.name,
    title: title(n, "name", text) || n.attrs.name,
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
        sheet: txt(n, "sheet") ?? "", frames: +(d?.attrs.length ?? 1), chargedFrame: num(n, "chargedFrame"),
        fireFrame: num(n, "fireFrame"), firePoint: { x: +(fp?.attrs.x ?? 0), y: +(fp?.attrs.y ?? 0) },
        mountPoint: { x: +(mp?.attrs.x ?? 0), y: +(mp?.attrs.y ?? 0) },
      } satisfies WeaponAnim;
    } else if (n.tag === "anim") {
      const d = kid(n, "desc");
      db.anims[n.attrs.name] = {
        sheet: txt(n, "sheet") ?? "", frames: +(d?.attrs.length ?? 1), x: +(d?.attrs.x ?? 0), y: +(d?.attrs.y ?? 0),
        time: num(n, "time", 1),
      } satisfies Anim;
    }
  }
}

/** Player hulls offered in the hangar, in FTL's order. Missing ones (no AE, say) are skipped. */
const HANGAR = [
  "PLAYER_SHIP_HARD", "PLAYER_SHIP_HARD_2", "PLAYER_SHIP_HARD_3", "PLAYER_SHIP_FED", "PLAYER_SHIP_FED_2",
  "PLAYER_SHIP_ROCK", "PLAYER_SHIP_ROCK_2", "PLAYER_SHIP_MANTIS", "PLAYER_SHIP_MANTIS_2", "PLAYER_SHIP_CIRCLE",
  "PLAYER_SHIP_CIRCLE_2", "PLAYER_SHIP_JELLY", "PLAYER_SHIP_JELLY_2", "PLAYER_SHIP_ANAEROBIC",
];

/**
 * Load order mirrors the game: blueprints.xml, then dlcBlueprints.xml, then dlcBlueprintsOverwrite.xml;
 * later definitions win.
 */
export function buildDbFromFtl(read: FileSource): GameDB {
  const text = { ...parseText(read("data/text_blueprints.xml") ?? ""), ...parseText(read("data/text_misc.xml") ?? "") };
  const db: GameDB = {
    source: "ftl", weapons: {}, systems: {}, crew: {}, ships: {}, layouts: {}, animSheets: {}, weaponAnims: {},
    anims: {}, sounds: {}, names: [], hangar: [],
  };
  for (const f of ["data/blueprints.xml", "data/dlcBlueprints.xml", "data/dlcBlueprintsOverwrite.xml"]) {
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
        if (s) db.systems[s.id] = s;
      } else if (n.tag === "crewBlueprint") db.crew[n.attrs.name] = parseCrew(n, text);
      else if (n.tag === "shipBlueprint" && n.attrs.name?.startsWith("PLAYER_SHIP_")) {
        db.ships[n.attrs.name] = parseShip(n, text);
      }
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
      if (n.tag === "music" || !n.text.trim().endsWith(".ogg")) continue;
      db.sounds[n.tag] = { file: n.text.trim(), volume: Number(n.attrs.volume ?? 5) || 5 };
    }
  }
  const names = read("data/names.xml");
  if (names) db.names = [...new Set(walk(parseXml(names), "name").map((n) => n.text.trim()).filter((n) => /^[A-Za-z][A-Za-z .'-]{1,13}$/.test(n)))];
  return db;
}
