/**
 * The practice opponent. One `level` in [0, 1] drives everything, so difficulty is a single slider:
 *
 *   level   thinks every   mistakes   targeting                        crew / power
 *   0.0     ~3 s           45 %       random rooms                     never touches crew or power
 *   0.3     ~2.2 s         31 %       shields > weapons > helm         repairs, keeps shields fed
 *   0.6     ~1.4 s         18 %       + volley sync                    + medbay, firefighting, power swaps
 *   1.0     ~0.3 s         0 %        + beams held until shields drop  (same, faster and error-free)
 *
 * Past ~0.5, play quality stops separating bots in mirror fights, so difficultyToBot() adds hangar scrap
 * on top. Bench: npx tsx tools/bench/ladder.ts.
 *
 * It only issues Commands, exactly like a player, so it can't cheat the sim. `log` keeps its recent
 * reasoning for the debug panel.
 */
import type { GameDB, SystemId } from "@ftl/data";
import type { Command } from "./commands.ts";
import { geometry, roomCentre, type Geometry } from "./geometry.ts";
import { baseLoadout, buyableWeapons, hullSystems, priceLoadout, randomCrewName, usable, type Loadout } from "./loadout.ts";
import type { Match } from "./match.ts";
import { Rng } from "./rng.ts";
import { DT, RACES } from "./rules.ts";
import type { CrewState, ShipState } from "./state.ts";

export interface BotSkills {
  thinkEvery: number;
  mistake: number;
  smartTargets: boolean;
  syncVolleys: boolean;
  missilesOnShields: boolean;
  beamAfterShields: boolean;
  repair: boolean;
  powerMgmt: boolean;
  medbay: boolean;
  firefight: boolean;
  stations: boolean;
}

export function botSkills(level: number): BotSkills {
  const l = Math.max(0, Math.min(1, level));
  return {
    thinkEvery: 3.0 - 2.7 * l,
    mistake: 0.45 * (1 - l),
    smartTargets: l >= 0.25,
    syncVolleys: l >= 0.55,
    // Measured (tools/bench/ab.ts, 40 seeds vs level 0.5): aiming missiles at shields and pulling crew
    // back to stations both lost games, so they stay off unless forced via overrides.
    missilesOnShields: false,
    beamAfterShields: l >= 0.75,
    repair: l >= 0.2,
    powerMgmt: l >= 0.3,
    medbay: l >= 0.45,
    firefight: l >= 0.55,
    stations: false,
  };
}

const PRIORITY: SystemId[] = ["shields", "weapons", "pilot", "engines", "oxygen", "medbay", "sensors", "doors"];

export class Bot {
  level = 0;
  skills = botSkills(0);
  log: string[] = [];
  private next = 0;
  private rng: Rng;

  constructor(level: number, seed = 12345, public overrides: Partial<BotSkills> = {}) {
    this.rng = new Rng(seed);
    this.setLevel(level);
  }

  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    this.skills = { ...botSkills(this.level), ...this.overrides };
  }

  private note(m: Match, s: string): void {
    this.log.push(`${(m.state.tick * DT).toFixed(1)}s  ${s}`);
    if (this.log.length > 60) this.log.shift();
  }

  think(m: Match, me: 0 | 1): Command[] {
    const t = m.state.tick * DT;
    if (t < this.next) return [];
    const sk = this.skills;
    this.next = t + sk.thinkEvery * (0.75 + this.rng.next() * 0.5);
    if (this.rng.chance(sk.mistake)) {
      this.note(m, "hesitates");
      return [];
    }
    const out: Command[] = [];
    const ship = m.state.ships[me];
    const enemy = m.state.ships[1 - me];
    this.weapons(m, ship, enemy, out);
    if (sk.powerMgmt) this.power(m, ship, out);
    this.specialPower(ship, out);
    // As FTL's AI does at every level: a bot with a teleporter always boards, a cloak dodges volleys, a
    // hacking drone goes on the shields.
    this.reserved = new Set();
    this.boarding(m, ship, out);
    this.cloakAndHack(m, ship, enemy, out);
    this.crew(m, ship, out);
    return out;
  }

  /** Crew the boarding plan has claimed this think (the crew planner leaves them alone). */
  private reserved = new Set<number>();

  /** Teleporter, cloaking and hacking take any spare reactor, or the idle medbay's bar. */
  private specialPower(ship: ShipState, out: Command[]): void {
    let used = Object.values(ship.systems).reduce((a, x) => a + (x && !["pilot", "sensors", "doors"].includes(x.id) ? x.power : 0), 0);
    const hurt = ship.crew.some((c) => !c.dead && c.owner === ship.idx && c.hp < c.maxHp * 0.45);
    const med = ship.systems.medbay;
    let medFree = !hurt && !!med && med.power > 0;
    for (const id of ["artillery", "artillery2", "artillery3", "artillery4", "mind", "hacking", "cloaking", "teleporter"] as SystemId[]) {
      const s = ship.systems[id];
      if (!s || s.locked || s.power >= usable(s)) continue;
      if (used < ship.reactor) {
        out.push({ c: "power", system: id, delta: 1 });
        used++;
      } else if (medFree) {
        out.push({ c: "power", system: "medbay", delta: -1 }, { c: "power", system: id, delta: 1 });
        medFree = false;
      } else if (s.power === 0 && (ship.systems.engines?.power ?? 0) > 2) {
        // Nothing spare: one engine bar is worth less than a working teleporter, cloak or hack.
        out.push({ c: "power", system: "engines", delta: -1 }, { c: "power", system: id, delta: 1 });
      }
    }
  }

  private cloakAndHack(m: Match, ship: ShipState, enemy: ShipState, out: Command[]): void {
    // Battery: switch it on whenever systems want more power than the reactor gives.
    const bat = ship.systems.battery;
    if (bat && m.eff(bat) > 0 && (ship.battery?.t ?? 0) <= 0 && (ship.battery?.cd ?? 0) <= 0) {
      const want = Object.values(ship.systems).some((s) => s && !["pilot", "sensors", "doors", "battery", "medbay", "clonebay"].includes(s.id) && s.power < usable(s));
      if (want) {
        out.push({ c: "battery" });
        this.note(m, "battery");
      }
    }
    // Mind control: intruders at home first, else the enemy room with the most crew.
    const ms = ship.systems.mind;
    if (ms && m.eff(ms) > 0 && (ship.mindCd ?? 0) <= 0) {
      const g = geometry(m.db.layouts[ship.layout]);
      const intruder = ship.crew.find((c) => c.owner !== ship.idx && !c.dead && c.dying === undefined && c.drone === undefined && !c.mind);
      if (intruder) out.push({ c: "mind", room: g.tiles.get(intruder.tile)!.room, enemy: false });
      else if ((enemy.superShield ?? 0) <= 0) {
        const eg = geometry(m.db.layouts[enemy.layout]);
        const counts = new Map<number, number>();
        for (const c of enemy.crew) if (c.owner === enemy.idx && !c.dead && c.drone === undefined && !c.mind) counts.set(eg.tiles.get(c.tile)!.room, (counts.get(eg.tiles.get(c.tile)!.room) ?? 0) + 1);
        const best = [...counts].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] >= 2) out.push({ c: "mind", room: best[0], enemy: true });
      }
    }
    // Artillery: aim at the shields (then weapons) when the bot knows where they are.
    if (ship.systems.artillery && this.level >= 0.4 && ship.artilleryTarget == null) {
      const t = enemy.systems.shields ?? enemy.systems.weapons;
      if (t) out.push({ c: "artilleryTarget", room: t.room });
    }
    const cs = ship.systems.cloaking;
    if (cs && m.eff(cs) > 0 && (ship.cloak?.t ?? 0) <= 0 && (ship.cloak?.cd ?? 0) <= 0) {
      // Cloak as a volley leaves the enemy's guns (+60 evasion while it flies).
      const incoming = m.state.projectiles.some((p) => p.from === enemy.idx && p.kind !== "BEAM" && p.delay <= 0 && p.t < 0.4);
      if (incoming) {
        out.push({ c: "cloak" });
        this.note(m, "cloak");
      }
    }
    const hs = ship.systems.hacking;
    if (!hs || m.eff(hs) <= 0) return;
    if (!ship.hack && (ship.droneParts ?? 0) > 0) {
      const target = enemy.systems.shields ?? enemy.systems.weapons;
      if (target && (enemy.superShield ?? 0) <= 0) {
        out.push({ c: "hackLaunch", room: target.room });
        this.note(m, `hack → ${target.id}`);
      }
    } else if (ship.hack?.attached && ship.hack.pulse <= 0 && ship.hack.cd <= 0) {
      // Pulse with a volley ready, so shields are down when it lands.
      if (ship.weapons.some((w) => w.volleys > 0) || this.level < 0.5) {
        out.push({ c: "hackPulse" });
        this.note(m, "hack pulse");
      }
    }
  }

  // ---------------------------------------------------------------- weapons

  private pickRoom(enemy: ShipState, prefer: SystemId[]): number {
    // Easy bots sometimes aim at empty rooms (hull damage only), which gives the player room to breathe.
    if (this.level < 0.35 && this.rng.chance(0.45 * (1 - this.level / 0.35))) {
      const empty = enemy.rooms.filter((r) => !Object.values(enemy.systems).some((s) => s && s.room === r.id));
      if (empty.length) return this.rng.pick(empty).id;
    }
    if (!this.skills.smartTargets) return this.rng.pick(enemy.rooms).id;
    for (const id of prefer) {
      const s = enemy.systems[id];
      if (s && s.damage < s.level) return s.room;
    }
    return this.rng.pick(enemy.rooms).id;
  }

  private weapons(m: Match, ship: ShipState, enemy: ShipState, out: Command[]): void {
    const sk = this.skills;
    const eg = geometry(m.db.layouts[enemy.layout]);
    ship.weapons.forEach((w, slot) => {
      if (!w.powered) out.push({ c: "weaponPower", slot, on: true });
    });
    (ship.drones ?? []).forEach((d, slot) => {
      if (d.powered || (ship.droneParts ?? 0) <= 0) return;
      // Free a reactor bar for the drone if needed: the medbay first (nobody hurt), then the engines.
      const used = Object.values(ship.systems).reduce((a, x) => a + (x && !["pilot", "sensors", "doors"].includes(x.id) ? x.power : 0), 0);
      const need = m.db.droneBPs?.[d.bp]?.power ?? 1;
      if (used + need > ship.reactor) {
        const hurt = ship.crew.some((c) => !c.dead && c.owner === ship.idx && c.hp < c.maxHp * 0.6);
        const from = !hurt && (ship.systems.medbay?.power ?? 0) > 0 ? "medbay" : (ship.systems.engines?.power ?? 0) > 1 ? "engines" : null;
        for (let i = 0; from && i < need; i++) out.push({ c: "power", system: from, delta: -1 });
      }
      out.push({ c: "dronePower", slot, on: true });
    });
    const lasers = ship.weapons.filter((w) => {
      const bp = m.wbp(w.bp);
      return w.powered && (bp.type === "LASER" || bp.type === "BURST");
    });
    const shotsReady = lasers.filter((w) => w.volleys > 0).reduce((a, w) => a + m.wbp(w.bp).shots, 0);
    const shotsTotal = lasers.reduce((a, w) => a + m.wbp(w.bp).shots, 0);
    // Volley sync: hold lasers until together they can strip the shields, then release them all.
    const release = !sk.syncVolleys || shotsTotal <= enemy.shieldLayers || shotsReady >= shotsTotal || shotsReady > enemy.shieldLayers + 1;
    ship.weapons.forEach((w, slot) => {
      if (!w.powered) return;
      const bp = m.wbp(w.bp);
      if (bp.type === "BEAM") {
        if (sk.beamAfterShields && bp.damage > 0 && enemy.shieldLayers >= bp.damage) {
          if (w.target) out.push({ c: "target", slot, target: null });
          return;
        }
        const room = this.pickRoom(enemy, ["shields", "weapons", "oxygen"]);
        if (w.target && w.autofire) return;
        out.push({ c: "autofire", slot, on: true }, { c: "target", slot, target: { kind: "beam", ...this.beamLine(eg, room, bp.length || 60) } });
        this.note(m, `${bp.title} sweeps from room ${room}`);
        return;
      }
      const missile = bp.type === "MISSILES" || bp.type === "BOMB";
      if (missile && ship.missiles < bp.missiles) return;
      let prefer: SystemId[] = missile ? ["weapons", "shields", "pilot"] : ["shields", "weapons", "engines", "pilot"];
      // Missiles on the shield room only pay off when the lasers can't break the shields alone.
      if (missile && sk.missilesOnShields && enemy.shieldLayers >= 2 && shotsTotal > 0 && shotsTotal <= enemy.shieldLayers + 1)
        prefer = ["shields", "weapons"];
      const room = this.pickRoom(enemy, prefer);
      if (!missile && !release) {
        if (w.autofire) out.push({ c: "autofire", slot, on: false });
        if (w.target) out.push({ c: "target", slot, target: null });
        return;
      }
      if (!w.autofire) out.push({ c: "autofire", slot, on: true });
      if (!(w.target?.kind === "room" && w.target.room === room)) {
        out.push({ c: "target", slot, target: { kind: "room", room } });
        const sys = Object.values(enemy.systems).find((s) => s && s.room === room);
        this.note(m, `${bp.title} → ${sys ? sys.id : `room ${room}`}${!missile && sk.syncVolleys ? " (volley)" : ""}`);
      }
    });
  }

  /** A beam line from the room's centre toward a neighbouring room, so it crosses two rooms. */
  private beamLine(g: Geometry, room: number, length: number) {
    const a = roomCentre(g, room);
    const nb = (g.roomDoors.get(room) ?? []).filter((r) => r >= 0);
    const b = nb.length ? roomCentre(g, nb[0]) : { x: a.x + length, y: a.y };
    const dx = b.x - a.x || 1;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    return { x1: a.x, y1: a.y, x2: a.x + (dx / d) * length, y2: a.y + (dy / d) * length };
  }

  // ---------------------------------------------------------------- power

  private power(m: Match, ship: ShipState, out: Command[]): void {
    const med = ship.systems.medbay;
    const hurt = this.skills.medbay && ship.crew.some((c) => !c.dead && c.owner === ship.idx && c.hp < c.maxHp * 0.45);
    const order: [SystemId, number][] = [["shields", 99], ["engines", 99], ["oxygen", ship.rooms.some((r) => r.o2 < 60) ? 99 : 1]];
    if (med) order.splice(hurt ? 0 : 3, 0, ["medbay", hurt ? 99 : 0]);
    for (const [id, n] of order) {
      const s = ship.systems[id];
      if (!s) continue;
      if (s.power < Math.min(n, usable(s))) out.push({ c: "power", system: id, delta: 1 });
      if (n === 0 && s.power > 0) out.push({ c: "power", system: id, delta: -1 });
    }
    if (med && hurt && med.power === 0 && (ship.systems.engines?.power ?? 0) > 0) {
      out.push({ c: "power", system: "engines", delta: -1 }, { c: "power", system: "medbay", delta: 1 });
      this.note(m, "engines → medbay");
    }
  }

  // ---------------------------------------------------------------- boarding

  /** Use the teleporter: gather two healthy crew on the pad, send them at the enemy weapons/shields, pull them home when hurt. */
  private boarding(m: Match, ship: ShipState, out: Command[]): void {
    const tp = ship.systems.teleporter;
    if (!tp) return;
    const g = geometry(m.db.layouts[ship.layout]);
    const roomOf = (c: CrewState) => g.tiles.get(c.home)!.room;
    const alive = ship.crew.filter((c) => !c.dead && c.dying === undefined && c.owner === ship.idx && c.drone === undefined);
    const busy = this.reserved;
    const enemy = m.state.ships[1 - ship.idx];
    const eg = geometry(m.db.layouts[enemy.layout]);
    const away = enemy.crew.filter((c) => c.owner === ship.idx && !c.dead && c.dying === undefined && c.drone === undefined);
    const ready = m.teleReady(ship);
    // Wounded boarders come home.
    // FTL's AI calls boarders back once they're hurt.
    const hurt = away.find((c) => c.hp < c.maxHp * 0.5);
    if (hurt && ready) {
      out.push({ c: "retrieve", room: eg.tiles.get(hurt.tile)!.room });
      this.note(m, "retrieve boarders");
      return;
    }
    // Boarders with nothing left to wreck move on to another system.
    for (const c of away) {
      if (c.path.length || c.task === "fight" || c.task === "sabotage") continue;
      const next = Object.values(enemy.systems).find((s) => s && s.level > 0 && s.damage < s.level);
      if (next) out.push({ c: "moveCrew", crew: [c.id], room: next.room, enemy: true });
    }
    if (away.length || ship.crew.some((c) => c.owner !== ship.idx && !c.dead)) return;
    if (alive.length < 2) return;
    const want = Math.min(2, alive.length - 1);
    const onPad = alive.filter((c) => roomOf(c) === tp.room && c.path.length === 0 && c.hp > c.maxHp * 0.8);
    if (ready && onPad.length >= want) {
      const target = enemy.systems.weapons ?? enemy.systems.shields;
      if (target && (enemy.superShield ?? 0) <= 0) {
        out.push({ c: "teleport", room: target.room });
        this.note(m, `board → ${target.id}`);
      }
      return;
    }
    const pilot = ship.systems.pilot;
    const pick = alive
      .filter((c) => !busy.has(c.id) && c.home !== pilot?.station && c.hp > c.maxHp * 0.8 && roomOf(c) !== tp.room)
      .sort((a, b) => (RACES[b.race]?.combat ?? 1) - (RACES[a.race]?.combat ?? 1));
    for (let i = onPad.length; i < want && pick.length; i++) {
      const c = pick.shift()!;
      busy.add(c.id);
      out.push({ c: "moveCrew", crew: [c.id], room: tp.room });
    }
    onPad.forEach((c) => busy.add(c.id));
  }

  // ---------------------------------------------------------------- crew

  private crew(m: Match, ship: ShipState, out: Command[]): void {
    const sk = this.skills;
    if (!sk.repair) return;
    const g = geometry(m.db.layouts[ship.layout]);
    const roomOf = (c: CrewState) => g.tiles.get(c.home)!.room;
    const busy = new Set<number>(this.reserved);
    const alive = ship.crew.filter((c) => !c.dead && c.dying === undefined && c.owner === ship.idx && c.drone === undefined);
    const send = (c: CrewState, room: number, why: string) => {
      busy.add(c.id);
      if (roomOf(c) === room) return;
      out.push({ c: "moveCrew", crew: [c.id], room });
      this.note(m, `${c.name} → ${why}`);
    };
    const pilot = ship.systems.pilot;
    const isPilot = (c: CrewState) => !!pilot && c.home === pilot.station;
    const spare = () => alive.find((c) => !busy.has(c.id) && !isPilot(c) && c.hp > c.maxHp * 0.3);
    // 0. Intruders: meet them with one more crew member than they have (fighters first), then board back.
    const intruders = ship.crew.filter((c) => c.owner !== ship.idx && !c.dead && c.dying === undefined);
    for (const room of [...new Set(intruders.map((c) => g.tiles.get(c.tile)!.room))]) {
      const n = intruders.filter((c) => g.tiles.get(c.tile)!.room === room).length + 1;
      const here = alive.filter((c) => roomOf(c) === room && c.hp > c.maxHp * 0.35);
      here.forEach((c) => busy.add(c.id));
      const fighters = alive.filter((c) => !busy.has(c.id) && !isPilot(c) && c.hp > c.maxHp * 0.5).sort((a, b) => (RACES[b.race]?.combat ?? 1) - (RACES[a.race]?.combat ?? 1));
      for (let i = here.length; i < n && fighters.length; i++) send(fighters.shift()!, room, "repel boarders");
    }
    // 1. Wounded to the medbay; patients stay until healed.
    const med = ship.systems.medbay;
    if (sk.medbay && med && m.eff(med) > 0) {
      for (const c of alive) {
        if (c.hp < c.maxHp * 0.4 && roomOf(c) !== med.room) send(c, med.room, "medbay");
        else if (roomOf(c) === med.room && c.hp < c.maxHp) busy.add(c.id);
      }
    }
    // 2. Fires (if allowed), breaches and damaged systems, most important room first.
    const sysIn = (room: number) => Object.values(ship.systems).find((s) => s && s.room === room);
    const rank = (room: number) => {
      const s = sysIn(room);
      return s ? PRIORITY.indexOf(s.id) : 99;
    };
    for (const rs of [...ship.rooms].sort((a, b) => rank(a.id) - rank(b.id))) {
      const sys = sysIn(rs.id);
      const fires = Object.keys(rs.fires).length;
      const problem = (sk.firefight && fires > 0) || Object.keys(rs.breaches).length > 0 || (sys && sys.damage > 0);
      if (!problem) continue;
      const here = alive.filter((c) => roomOf(c) === rs.id);
      for (const c of here) busy.add(c.id);
      const needed = fires > 0 || (sys && sys.damage >= 2) ? 2 : 1;
      for (let i = here.length; i < needed; i++) {
        const c = spare();
        if (!c) break;
        if (fires > 2 && !RACES[c.race]?.fireImmune && this.level < 0.9) break;
        send(c, rs.id, sys && sys.damage ? `repair ${sys.id}` : fires ? "fight fire" : "fix breach");
      }
    }
    // 3. Keep stations manned, helm first.
    if (sk.stations) {
      for (const id of ["pilot", "weapons", "shields", "engines"] as SystemId[]) {
        const s = ship.systems[id];
        if (!s || !s.station || s.damage >= s.level) continue;
        if (alive.some((c) => c.home === s.station)) continue;
        // Only crew with nothing to do: pulling repairers back to stations loses more than manning gains.
        const c = alive.find((q) => !busy.has(q.id) && q.task === "idle" && q.path.length === 0 && q.hp > q.maxHp * 0.6);
        if (c) send(c, s.room, `man ${id}`);
      }
    }
  }
}

/**
 * The bot's hangar. Low levels spend at random. From level 0.5 it follows a build order (2 shield
 * layers, good weapons, weapon bars to power them, engines, more shields) and buys reactor bars whenever
 * its systems would draw more than the reactor gives, so extra scrap turns into usable strength.
 */
export function botLoadout(db: GameDB, shipId: string, scrap: number, level: number, seed = 1): Loadout {
  const rng = new Rng(seed);
  const l = baseLoadout(db, shipId);
  const ship = db.ships[shipId];
  const hs = hullSystems(db, shipId);
  const lv = (x: Loadout, id: SystemId) => x.systems[id] ?? hs.find((s) => s.id === id)?.base ?? 0;
  const tryApply = (f: (x: Loadout) => boolean | void) => {
    const c = structuredClone(l);
    if (f(c) === false) return false;
    const ok = priceLoadout(db, c, scrap).ok;
    if (ok) Object.assign(l, c);
    return ok;
  };
  const weaponsPower = (x: Loadout) => x.weapons.reduce((a, w) => a + (db.weapons[w]?.power ?? 1), 0);
  /** Reactor bars the main systems want: shields, engines, 1 oxygen, 1 medbay, and the weapons in use. */
  const demand = (x: Loadout) => lv(x, "shields") + lv(x, "engines") + Math.min(1, lv(x, "oxygen")) + Math.min(1, lv(x, "medbay")) + Math.min(lv(x, "weapons"), weaponsPower(x)) + lv(x, "teleporter") + lv(x, "cloaking") + lv(x, "hacking") + lv(x, "mind") + lv(x, "artillery");
  const feedReactor = () => {
    while (demand(l) > l.reactor && tryApply((x) => void (x.reactor += 1)));
  };
  const sysTo = (id: SystemId, target: number) => () => {
    let any = false;
    while (lv(l, id) < target && tryApply((x) => {
      const h = hs.find((s) => s.id === id);
      if (!h || lv(x, id) >= h.max) return false;
      x.systems[id] = lv(x, id) + 1;
    })) {
      any = true;
      feedReactor();
    }
    return any;
  };
  const shop = buyableWeapons(db).map((id) => db.weapons[id]);
  const good = ["LASER_BURST_2", "LASER_BURST_3", "MISSILES_2_PLAYER", "LASER_HEAVY_1", "ION_1", "SHOTGUN_PLAYER", "PH_TRIPLE", "PH_TORPEDO", "PH_HEAVY", "PH_SCATTER"];
  const buy = () => {
    if (l.weapons.length >= ship.weaponSlots) return false;
    const pool = level >= 0.5 ? shop.filter((w) => good.includes(w.id)) : shop;
    const ok = tryApply((x) => void x.weapons.push(rng.pick(pool.length ? pool : shop).id));
    if (ok) {
      // Enough weapon bars to power what we carry.
      sysTo("weapons", Math.min(8, weaponsPower(l)))();
      feedReactor();
    }
    return ok;
  };
  if (level >= 0.5) {
    const plan = [sysTo("shields", 4), sysTo("weapons", weaponsPower(l)), buy, sysTo("engines", 4), buy, sysTo("shields", 6), sysTo("engines", 5), sysTo("pilot", 2), buy, sysTo("shields", 8), sysTo("engines", 6), sysTo("pilot", 3)];
    for (const p of plan) p();
  } else {
    for (let i = 0; i < 6; i++) rng.chance(0.5) ? buy() : sysTo(rng.pick(["engines", "oxygen", "medbay", "shields", "weapons"] as SystemId[]), 8)();
  }
  feedReactor();
  for (let i = 0; i < 4; i++) {
    const race = level >= 0.5 && db.crew.engi ? "engi" : "human";
    tryApply((x) => void x.crew.push({ race, name: randomCrewName(db, x.crew.map((c) => c.name), seed + i * 13) }));
  }
  return l;
}

/** Convenience for the bench and tests: one bot per side per match, created on first use. */
const shared = new WeakMap<Match, [Bot, Bot]>();
export function botCommands(m: Match, me: 0 | 1, level = 0.6): Command[] {
  let b = shared.get(m);
  if (!b) {
    b = [new Bot(level, 1), new Bot(level, 2)];
    shared.set(m, b);
  }
  return b[me].think(m, me);
}

/** One difficulty slider (0-100) → bot skill and hangar scrap bonus. Skill tops out at 60; above that the
 *  bot gets extra scrap (up to +100 % at 100), because play skill alone stops separating bots past ~0.5. */
export function difficultyToBot(d: number): { level: number; scrapBonus: number } {
  const x = Math.max(0, Math.min(100, d));
  return { level: Math.min(1, x / 60), scrapBonus: x <= 60 ? 0 : (x - 60) / 40 };
}

/**
 * A single-player enemy hull as the bot's ship. Systems scale from the blueprint's starting power toward
 * its max with `level`; weapons are drawn from the hull's own pool (stronger picks at higher levels) to
 * fit its weapon bars and mounts; crew grow from amount toward max. `hullBonus` adds hull points, since
 * sector enemies have 7-14 hull against a player cruiser's 30.
 */
export function enemyLoadout(db: GameDB, shipId: string, level: number, seed = 1, hullBonus = 0): Loadout {
  const s = db.ships[shipId];
  const rng = new Rng(seed);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * Math.max(0, Math.min(1, level)) * 0.6);
  const systems: Loadout["systems"] = {};
  for (const h of hullSystems(db, shipId)) {
    const slot = s.systems.find((x) => x.id === h.id)!;
    systems[h.id] = Math.min(h.max, lerp(slot.power, slot.max ?? slot.power));
  }
  const mounts = Math.min(4, db.layouts[s.layout].mounts.length);
  const bars = systems.weapons ?? 0;
  const pool = (s.weaponPool ?? s.weapons).map((id) => db.weapons[id]).filter(Boolean);
  // Higher levels draw from the pricier half of the pool.
  const sorted = [...pool].sort((a, b) => a.cost - b.cost);
  const top = level >= 0.5 ? sorted.slice(Math.floor(sorted.length / 3)) : sorted.slice(0, Math.ceil((sorted.length * 2) / 3));
  const weapons: string[] = [];
  let used = 0;
  for (let tries = 0; tries < 40 && weapons.length < mounts && sorted.length; tries++) {
    const w = rng.pick(top.length ? top : sorted);
    if (used + w.power > bars) continue;
    weapons.push(w.id);
    used += w.power;
  }
  if (!weapons.length && sorted.length) weapons.push(sorted[0].id);
  const n = lerp(s.crewCount, s.crewMax ?? s.crewCount);
  const race = s.crewRaces[0] ?? "human";
  const crew = Array.from({ length: Math.max(1, n) }, (_, i) => ({ race: RACES[race] ? race : "human", name: randomCrewName(db, [], seed * 7 + i * 31) }));
  const demand = (systems.shields ?? 0) + (systems.engines ?? 0) + Math.min(1, systems.oxygen ?? 0) + Math.min(1, systems.medbay ?? 0) + used;
  return {
    ship: shipId, systems, reactor: Math.max(s.maxPower, demand), weapons, crew, missiles: Math.max(s.missiles, 8), hull: s.health + hullBonus,
    drones: (s.drones ?? []).filter((d) => db.droneBPs?.[d]).slice(0, Math.max(s.droneSlots ?? 0, (s.drones ?? []).length)),
    droneParts: Math.max(s.droneParts ?? 0, (s.drones ?? []).length ? 6 : 0),
  };
}
