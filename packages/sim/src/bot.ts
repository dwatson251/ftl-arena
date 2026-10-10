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
import { findPath, geometry, roomCentre, type Geometry } from "./geometry.ts";
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
}

export function botSkills(level: number): BotSkills {
  const l = Math.max(0, Math.min(1, level));
  return {
    thinkEvery: 3.0 - 2.7 * l,
    mistake: 0.45 * (1 - l),
    smartTargets: l >= 0.25,
    syncVolleys: l >= 0.55,
    // Measured (tools/bench/ab.ts, 40 seeds vs level 0.5): aiming missiles at shields lost games, so it
    // stays off unless forced via overrides.
    missilesOnShields: false,
    beamAfterShields: l >= 0.75,
    repair: l >= 0.2,
    powerMgmt: l >= 0.3,
    medbay: l >= 0.45,
    firefight: l >= 0.55,
  };
}

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
  /** FTL's AI boards with one party per fight: once it's sent, only those crew go again, and none once they're dead. */
  private party: Set<number> | null = null;

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
      if (d.powered || (!d.deployed && (ship.droneParts ?? 0) <= 0) || (d.rebuild ?? 0) > 0) return;
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
    // The party, once sent, is the only one: if they all died, the AI stops boarding.
    const party = this.party;
    if (party && !alive.some((c) => party.has(c.id))) return;
    const eligible = party ? alive.filter((c) => party.has(c.id)) : alive;
    if (!party && alive.length < 2) return;
    const want = party ? eligible.length : Math.min(2, alive.length - 1);
    const onPad = eligible.filter((c) => roomOf(c) === tp.room && c.path.length === 0 && c.hp > c.maxHp * 0.8);
    // Whoever is on the pad or walking to it belongs to the boarding plan (the crew planner leaves them be);
    // hurt ones (back from a raid) heal in the medbay first, then come back to the pad.
    const med = ship.systems.medbay;
    for (const c of eligible) {
      if (roomOf(c) !== tp.room) continue;
      if (c.hp <= c.maxHp * 0.8 && med && m.eff(med) > 0 && !med.hacked) out.push({ c: "moveCrew", crew: [c.id], room: med.room });
      busy.add(c.id);
    }
    if (ready && want > 0 && onPad.length >= want) {
      const target = enemy.systems.weapons ?? enemy.systems.shields;
      if (target && (enemy.superShield ?? 0) <= 0) {
        out.push({ c: "teleport", room: target.room });
        this.party ??= new Set(onPad.map((c) => c.id));
        this.note(m, `board → ${target.id}`);
      }
      return;
    }
    const pilot = ship.systems.pilot;
    const pick = eligible
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

  /**
   * Crew AI after FTL's CrewAI (as documented by the xftl project): every problem becomes a task with a
   * priority, lower first. Healing comes first (the wounded go to the medbay), then fighting boarders (one
   * more defender than there are boarders in the room), fires, urgent repairs (the medbay while anyone is
   * below half health, oxygen while the air is thin), shields, weapons, hull breaches, every other repair by
   * FTL's system priority, and last manning stations (64-70). Each task goes to the nearest crew member not
   * already taken, so the rest keep their stations; as the crew dwindles, stations empty first.
   */
  private crew(m: Match, ship: ShipState, out: Command[]): void {
    const sk = this.skills;
    if (!sk.repair) return;
    const g = geometry(m.db.layouts[ship.layout]);
    const roomOf = (c: CrewState) => g.tiles.get(c.home)!.room;
    const alive = ship.crew.filter((c) => !c.dead && c.dying === undefined && c.owner === ship.idx && c.drone === undefined && !c.mind && !c.beam && !this.reserved.has(c.id));
    if (!alive.length) return;
    const sysIn = (room: number) => Object.values(ship.systems).find((s) => s && s.room === room);
    const sysPrio = (room: number) => {
      const s = sysIn(room);
      return s ? SYS_PRIORITY[s.id] ?? 8 : 8;
    };
    const intruders = ship.crew.filter((c) => c.owner !== ship.idx && !c.dead && c.dying === undefined);
    // Rooms the AI won't send anyone into: an open airlock, four or more fires.
    const danger = (room: number) => {
      const rs = ship.rooms.find((r) => r.id === room);
      if (!rs) return false;
      const airlock = g.doors.some((d, i) => ship.doors[i] && (d.roomA === room || d.roomB === room) && (d.roomA < 0 || d.roomB < 0));
      return airlock || Object.keys(rs.fires).length >= 4;
    };
    const tasks: { room: number; prio: number; why: string; kind: "heal" | "fight" | "work" | "man" }[] = [];
    const med = ship.systems.medbay;
    const medOk = sk.medbay && !!med && m.eff(med) > 0 && !med.hacked && !danger(med.room);
    const patients = new Set<number>();
    if (medOk) {
      for (const c of alive) {
        // Below a quarter health they go to the medbay, and once there stay until healed.
        if (c.hp < c.maxHp * 0.25 || (roomOf(c) === med!.room && c.hp < c.maxHp)) patients.add(c.id);
      }
    }
    // Boarders: outnumber them, one defender per boarder plus one per room they're in.
    const boarded = new Map<number, number>();
    for (const c of intruders) {
      const room = g.tiles.get(c.tile)!.room;
      boarded.set(room, (boarded.get(room) ?? 0) + 1);
    }
    for (const [room, n] of boarded) for (let k = 0; k <= n; k++) tasks.push({ room, prio: 8 + sysPrio(room), why: "repel boarders", kind: "fight" });
    const hurt = alive.some((c) => c.hp < c.maxHp * 0.5);
    const thinAir = ship.rooms.reduce((x, r) => x + r.o2, 0) / Math.max(1, ship.rooms.length) < 50;
    for (const rs of ship.rooms) {
      if (danger(rs.id)) continue;
      const sys = sysIn(rs.id);
      if (sk.firefight && Object.keys(rs.fires).length && rs.o2 > 10) {
        tasks.push({ room: rs.id, prio: sysPrio(rs.id) + 20, why: "fight fire", kind: "work" }, { room: rs.id, prio: sysPrio(rs.id) + 20, why: "fight fire", kind: "work" });
      }
      if (Object.keys(rs.breaches).length) tasks.push({ room: rs.id, prio: 44, why: "fix breach", kind: "work" });
      if (sys && sys.damage > 0) {
        // Urgency: a medbay with people hurt, oxygen with the air running out, then shields and weapons.
        const prio = sys.id === "medbay" && hurt ? 40 : sys.id === "oxygen" && thinAir ? 41 : sys.id === "shields" ? 42 : sys.id === "weapons" ? 43 : 46 + sysPrio(rs.id);
        tasks.push({ room: rs.id, prio, why: `repair ${sys.id}`, kind: "work" });
      }
    }
    for (const [id, prio] of MAN_PRIORITY) {
      const s = ship.systems[id];
      if (!s?.station || s.damage >= s.level || danger(s.room)) continue;
      tasks.push({ room: s.room, prio, why: `man ${id}`, kind: "man" });
    }
    tasks.sort((a, b) => a.prio - b.prio);
    // Crew who are bad at fighting (half damage or under 100 HP) are kept out of fights unless that's everyone.
    const weak = (c: CrewState) => (RACES[c.race]?.combat ?? 1) < 1 || c.maxHp < 100;
    const allWeak = alive.every(weak);
    const free = new Set(alive.filter((c) => !patients.has(c.id)).map((c) => c.id));
    const dist = (c: CrewState, room: number) => {
      if (roomOf(c) === room) return -1;
      const t = g.roomTiles.get(room)?.[0];
      const p = t ? findPath(g, c.tile, t) : null;
      return p ? p.length : 1e9;
    };
    const send = (c: CrewState, room: number, why: string) => {
      if (roomOf(c) === room) return;
      out.push({ c: "moveCrew", crew: [c.id], room });
      this.note(m, `${c.name} → ${why}`);
    };
    for (const id of patients) {
      const c = alive.find((q) => q.id === id)!;
      send(c, med!.room, "medbay");
    }
    for (const t of tasks) {
      const cands = alive.filter((c) => free.has(c.id) && !(t.kind === "fight" && weak(c) && !allWeak) && !(t.kind === "fight" && c.hp < c.maxHp * 0.35));
      if (!cands.length) continue;
      const c = cands.reduce((a, b) => (dist(b, t.room) < dist(a, t.room) ? b : a));
      if (dist(c, t.room) >= 1e9) continue;
      free.delete(c.id);
      send(c, t.room, t.why);
    }
  }
}

/** FTL's system priority for crew tasks (CrewAI::PrioritizeSystem). */
const SYS_PRIORITY: Partial<Record<SystemId, number>> = {
  shields: 0, weapons: 1, clonebay: 1, artillery: 2, oxygen: 3, engines: 4, drones: 4, pilot: 4,
  cloaking: 5, mind: 5, hacking: 5, sensors: 6, battery: 6, doors: 7, medbay: 2, teleporter: 3,
};
/** FTL's manning priorities (lower first). */
const MAN_PRIORITY: [SystemId, number][] = [["pilot", 64], ["shields", 65], ["weapons", 66], ["engines", 67], ["sensors", 69], ["doors", 70]];

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
  // Difficulty caps what it fits, scrap or not: an easy bot flies one or two weapons and a single shield layer;
  // a hard one fills its mounts and runs four layers.
  const maxWeapons = Math.max(1, Math.min(ship.weaponSlots, 1 + Math.round(3 * level)));
  const maxShields = 2 + 2 * Math.round(3 * level);
  const maxEngines = 2 + Math.round(4 * level);
  const buy = () => {
    if (l.weapons.length >= Math.min(ship.weaponSlots, maxWeapons)) return false;
    const pool = level >= 0.5 ? shop.filter((w) => good.includes(w.id)) : shop;
    const ok = tryApply((x) => void x.weapons.push(rng.pick(pool.length ? pool : shop).id));
    if (ok) {
      // Enough weapon bars to power what we carry.
      sysTo("weapons", Math.min(8, weaponsPower(l)))();
      feedReactor();
    }
    return ok;
  };
  const sh = (n: number) => sysTo("shields", Math.min(n, maxShields));
  const en = (n: number) => sysTo("engines", Math.min(n, maxEngines));
  const plan = [sh(4), sysTo("weapons", weaponsPower(l)), buy, en(4), buy, sh(6), en(5), sysTo("pilot", level >= 0.4 ? 2 : 1), buy, sh(8), en(6), sysTo("pilot", level >= 0.7 ? 3 : 1)];
  for (const p of plan) p();
  feedReactor();
  // Most FTL ships carry 5-6 crew (the flagship more); easier bots hire fewer.
  for (let i = 0; l.crew.length < Math.min(BOT_CREW, 3 + Math.round(2 * level)) && i < 4; i++) {
    const race = level >= 0.5 && db.crew.engi ? "engi" : "human";
    tryApply((x) => void x.crew.push({ race, name: randomCrewName(db, x.crew.map((c) => c.name), seed + i * 13) }));
  }
  return l;
}

/** Crew a bot hires up to in the hangar, and the most a single-player enemy hull carries (FTL's ships rarely carry
 * more than 5-6; the flagship is the exception). */
const BOT_CREW = 5;
const ENEMY_CREW = 6;

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
export function enemyLoadout(db: GameDB, shipId: string, level: number, seed = 1, hullBonus = 0, budget?: number): Loadout {
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
  const n = s.id.startsWith("BOSS_") ? lerp(s.crewCount, s.crewMax ?? s.crewCount) : Math.min(ENEMY_CREW, lerp(s.crewCount, s.crewMax ?? s.crewCount));
  const race = s.crewRaces[0] ?? "human";
  // Automated ships fly with no crew at all.
  const crew = Array.from({ length: s.auto ? 0 : Math.max(1, n) }, (_, i) => ({ race: RACES[race] ? race : "human", name: randomCrewName(db, [], seed * 7 + i * 31) }));
  const demand = (systems.shields ?? 0) + (systems.engines ?? 0) + Math.min(1, systems.oxygen ?? 0) + Math.min(1, systems.medbay ?? 0) + used;
  const out: Loadout = {
    ship: shipId, systems, reactor: Math.max(s.maxPower, demand), weapons, crew, missiles: Math.max(s.missiles, 8), hull: s.health + hullBonus,
    // Hull augments come with the ship: a Zoltan ship's super shield starts full.
    augments: (s.augments ?? []).filter((a) => db.augments?.[a]),
    drones: (s.drones ?? []).filter((d) => db.droneBPs?.[d]).slice(0, Math.max(s.droneSlots ?? 0, (s.drones ?? []).length)),
    droneParts: Math.max(s.droneParts ?? 0, (s.drones ?? []).length ? 6 : 0),
  };
  // Within a scrap budget (the match's scrap plus the difficulty bonus): sell weapons and strip upgrades,
  // cheapest-to-lose first, until what's fitted costs no more than that.
  if (budget !== undefined && !/^BOSS_/.test(shipId)) {
    const cost = (x: Loadout) => priceLoadout(db, x, Number.MAX_SAFE_INTEGER).total;
    const strip: SystemId[] = ["oxygen", "medbay", "pilot", "engines", "shields", "weapons"];
    const floor = baseLoadout(db, shipId).systems;
    for (let n = 0; n < 60 && cost(out) > budget; n++) {
      if (out.weapons.length > 1) {
        out.weapons.pop();
        continue;
      }
      const id = strip.find((x) => (out.systems[x] ?? 0) > Math.max(1, floor[x] ?? 0));
      if (!id) break;
      out.systems[id] = (out.systems[id] ?? 0) - 1;
    }
    const sy = out.systems;
    out.reactor = Math.max(s.maxPower, (sy.shields ?? 0) + (sy.engines ?? 0) + Math.min(1, sy.oxygen ?? 0) + Math.min(1, sy.medbay ?? 0) + out.weapons.reduce((a, w) => a + (db.weapons[w]?.power ?? 1), 0));
  }
  return out;
}
