/**
 * The authoritative simulation. Pure: no clocks, no I/O. `step()` advances one tick (1/30 s); commands are
 * applied at the start of the tick they're queued for. Same seed + same commands = same state.
 */
import type { GameDB, SystemId, WeaponBP } from "@ftl/data";
import type { Command } from "./commands.ts";
import { findPath, geometry, key, roomAt, unkey, type Geometry } from "./geometry.ts";
import { autoPower, buildShip, isSubsystem, reactorUsed, usable, type Loadout } from "./loadout.ts";
import { Rng } from "./rng.ts";
import { DT, RULES, TICK_HZ, TILE, type SkillId } from "./rules.ts";
import type {
  CrewState, MatchConfig, MatchEvent, MatchState, Projectile, ShipState, SystemState, WeaponTarget,
} from "./state.ts";

const MANNABLE: SystemId[] = ["pilot", "engines", "shields", "weapons", "sensors", "doors"];

export class Match {
  state: MatchState;
  private rng: Rng;
  private queue: { player: 0 | 1; cmd: Command }[] = [];

  constructor(public db: GameDB, config: MatchConfig, loadouts: [Loadout, Loadout], players: [string, string]) {
    this.rng = new Rng(config.seed);
    const pick = (n: string[]) => n[this.rng.int(n.length)];
    const ships: [ShipState, ShipState] = [
      buildShip(db, loadouts[0], 0, players[0], pick),
      buildShip(db, loadouts[1], 1, players[1], pick),
    ];
    this.state = { tick: 0, rng: this.rng.s, nextId: 1, config, ships, projectiles: [], events: [], winner: null, endReason: "" };
    for (const s of ships) this.updateDerived(s);
  }

  /** Resume from a serialised state (bench replays). */
  static fromState(db: GameDB, state: MatchState): Match {
    const m = Object.create(Match.prototype) as Match;
    m.db = db;
    m.state = structuredClone(state);
    m.rng = new Rng(state.rng);
    m.queue = [];
    return m;
  }

  geo(ship: ShipState): Geometry {
    return geometry(this.db.layouts[ship.layout]);
  }

  push(player: 0 | 1, cmd: Command): void {
    this.queue.push({ player, cmd });
  }

  get over(): boolean {
    return this.state.winner !== null;
  }

  step(): void {
    const st = this.state;
    st.events = [];
    if (st.winner !== null) return;
    for (const { player, cmd } of this.queue.splice(0)) this.apply(st.ships[player], cmd);
    // Alternate which ship is processed first so simultaneous events don't always favour one side.
    const order = st.tick % 2 ? [st.ships[1], st.ships[0]] : st.ships;
    for (const s of order) this.systemsTick(s);
    for (const s of order) this.weaponsTick(s);
    this.projectilesTick(order[0].idx);
    for (const s of order) this.crewTick(s);
    for (const s of order) this.environmentTick(s);
    for (const s of order) this.updateDerived(s);
    st.tick++;
    this.checkEnd();
    st.rng = this.rng.s;
  }

  // ---------------------------------------------------------------- commands

  apply(ship: ShipState, cmd: Command): boolean {
    switch (cmd.c) {
      case "power": {
        const s = ship.systems[cmd.system];
        if (!s || isSubsystem(s.id)) return false;
        if (cmd.delta > 0) {
          if (reactorUsed(ship) >= ship.reactor || s.power >= usable(s)) return false;
          s.power++;
        } else {
          if (s.power <= 0) return false;
          s.power--;
          if (s.id === "weapons") this.clampWeapons(ship);
        }
        return true;
      }
      case "weaponPower": {
        const w = ship.weapons[cmd.slot];
        const ws = ship.systems.weapons;
        if (!w || !ws) return false;
        if (!cmd.on) {
          if (!w.powered) return false;
          w.powered = false;
          ws.power = Math.max(0, ws.power - this.wbp(w.bp).power);
          return true;
        }
        if (w.powered) return false;
        const need = this.weaponLoad(ship) + this.wbp(w.bp).power;
        if (need > usable(ws)) return false;
        const extra = need - ws.power;
        if (extra > 0) {
          if (reactorUsed(ship) + extra > ship.reactor) return false;
          ws.power += extra;
        }
        w.powered = true;
        return true;
      }
      case "target": {
        const w = ship.weapons[cmd.slot];
        if (!w) return false;
        if (cmd.target && !this.validTarget(ship, w.bp, cmd.target)) return false;
        w.target = cmd.target;
        return true;
      }
      case "autofire": {
        const w = ship.weapons[cmd.slot];
        if (!w) return false;
        w.autofire = cmd.on;
        return true;
      }
      case "moveCrew": {
        const g = this.geo(ship);
        if (!g.roomTiles.has(cmd.room)) return false;
        for (const id of cmd.crew) {
          const c = ship.crew.find((q) => q.id === id && !q.dead);
          if (c) this.sendCrew(ship, g, c, cmd.room);
        }
        return true;
      }
      case "door":
      case "doorsAll": {
        const d = ship.systems.doors;
        if (d && this.eff(d) <= 0) return false;
        if (cmd.c === "door") {
          if (cmd.door < 0 || cmd.door >= ship.doors.length) return false;
          ship.doors[cmd.door] = cmd.open;
        } else {
          const g = this.geo(ship);
          // "Open all" keeps airlocks shut, like FTL's door panel; the airlocks get their own button.
          ship.doors = ship.doors.map((o, i) => (g.doors[i].roomA === -1 || g.doors[i].roomB === -1 ? (cmd.open ? o : false) : cmd.open));
        }
        return true;
      }
    }
  }

  private validTarget(ship: ShipState, bpId: string, t: WeaponTarget): boolean {
    const enemy = this.state.ships[1 - ship.idx];
    const g = this.geo(enemy);
    const bp = this.wbp(bpId);
    if (t.kind === "room") return bp.type !== "BEAM" && g.roomTiles.has(t.room);
    return bp.type === "BEAM" && roomAt(g, t.x1, t.y1) >= 0;
  }

  private sendCrew(ship: ShipState, g: Geometry, c: CrewState, room: number): void {
    const tiles = g.roomTiles.get(room)!;
    const claimed = new Set(ship.crew.filter((q) => !q.dead && q !== c).map((q) => q.home));
    const sys = Object.values(ship.systems).find((s) => s && s.room === room && s.station);
    let dest = "";
    if (sys && !claimed.has(sys.station)) dest = sys.station;
    if (!dest) dest = tiles.find((t) => !claimed.has(t)) ?? "";
    if (!dest) return; // room full
    const from = c.path.length ? c.path[0] : c.tile;
    const p = findPath(g, from, dest);
    if (!p) return;
    c.home = dest;
    c.path = c.path.length ? [c.path[0], ...p] : p;
  }

  // ---------------------------------------------------------------- systems, shields, evasion

  wbp(id: string): WeaponBP {
    return this.db.weapons[id];
  }

  eff(s: SystemState | undefined): number {
    if (!s) return 0;
    return isSubsystem(s.id) ? usable(s) : Math.min(s.power, usable(s));
  }

  private weaponLoad(ship: ShipState): number {
    return ship.weapons.filter((w) => w.powered).reduce((a, w) => a + this.wbp(w.bp).power, 0);
  }

  private clampWeapons(ship: ShipState): void {
    const ws = ship.systems.weapons;
    const cap = ws ? this.eff(ws) : 0;
    for (let i = ship.weapons.length - 1; i >= 0 && this.weaponLoad(ship) > cap; i--) {
      if (ship.weapons[i].powered) ship.weapons[i].powered = false;
    }
  }

  /** Crew manning a system: alive, not stunned, standing still on the station tile. */
  mannedBy(ship: ShipState, id: SystemId): CrewState | undefined {
    const s = ship.systems[id];
    if (!s || !s.station || this.eff(s) <= 0) return undefined;
    return ship.crew.find((c) => !c.dead && c.stun <= 0 && c.path.length === 0 && c.tile === s.station);
  }

  skill(c: CrewState | undefined, sk: SkillId): number {
    if (!c) return 0;
    const [a, b] = RULES.skillXp[sk];
    return c.xp[sk] >= b ? 2 : c.xp[sk] >= a ? 1 : 0;
  }

  private gainXp(c: CrewState | undefined, sk: SkillId, n = 1): void {
    if (c) c.xp[sk] = Math.min(RULES.skillXp[sk][1], c.xp[sk] + n);
  }

  private systemsTick(ship: ShipState): void {
    for (const s of Object.values(ship.systems)) {
      if (!s) continue;
      if (s.ion > 0) {
        s.ionTimer -= DT;
        if (s.ionTimer <= 0) {
          s.ion--;
          s.ionTimer = s.ion > 0 ? RULES.ionDuration : 0;
        }
      }
      if (isSubsystem(s.id)) s.power = usable(s);
      else s.power = Math.min(s.power, usable(s));
    }
    this.clampWeapons(ship);
    // Shields
    const sh = ship.systems.shields;
    const max = Math.floor(this.eff(sh) / 2);
    if (ship.shieldLayers > max) {
      ship.shieldLayers = max;
      ship.shieldCharge = 0;
    }
    if (ship.shieldLayers < max) {
      const m = this.mannedBy(ship, "shields");
      const bonus = m ? RULES.shieldManBonus[this.skill(m, "shields")] : 0;
      ship.shieldCharge += (DT / RULES.shieldRecharge) * (1 + bonus);
      if (ship.shieldCharge >= 1) {
        ship.shieldLayers++;
        ship.shieldCharge = 0;
      }
    } else ship.shieldCharge = 0;
  }

  /** Evasion % (0..100). Needs a working helm; manned helm and engines add their bonuses. */
  evasionOf(ship: ShipState): number {
    const eng = this.eff(ship.systems.engines);
    const pilotSys = ship.systems.pilot;
    const pilotPower = this.eff(pilotSys);
    if (eng <= 0 || pilotPower <= 0) return 0;
    const pilot = this.mannedBy(ship, "pilot");
    let ev = RULES.engineEvasion[Math.min(8, eng)];
    const em = this.mannedBy(ship, "engines");
    if (em) ev += RULES.engineManBonus[this.skill(em, "engines")];
    if (pilot) return ev + RULES.pilotManBonus[this.skill(pilot, "pilot")];
    return Math.floor(ev * RULES.autopilot[Math.min(3, pilotPower)]);
  }

  private updateDerived(ship: ShipState): void {
    ship.evasion = this.evasionOf(ship);
  }

  // ---------------------------------------------------------------- weapons and projectiles

  cooldownOf(ship: ShipState, slot: number): number {
    const w = ship.weapons[slot];
    const bp = this.wbp(w.bp);
    let cd = bp.cooldown;
    if (bp.boost?.type === "cooldown") cd = Math.max(1, cd - bp.boost.amount * w.boost);
    return cd;
  }

  private weaponsTick(ship: ShipState): void {
    const manned = this.mannedBy(ship, "weapons");
    const rate = 1 + (manned ? RULES.weaponManBonus[this.skill(manned, "weapons")] : 0);
    for (const w of ship.weapons) {
      const bp = this.wbp(w.bp);
      const cd = this.cooldownOf(ship, w.slot);
      if (!w.powered) {
        w.charge = Math.max(0, w.charge - DT * RULES.weaponDrain);
        w.volleys = 0;
        w.boost = 0;
        continue;
      }
      if (w.volleys < bp.chargeLevels) {
        w.charge += DT * rate;
        if (w.charge >= cd) {
          w.volleys++;
          w.charge = w.volleys < bp.chargeLevels ? 0 : cd;
        }
      }
      if (w.volleys > 0 && w.target && ship.missiles >= bp.missiles) {
        // Charge weapons wait until fully charged unless the player retargets; FTL fires them on click,
        // which in a no-pause match is "fire when full" for autofire and "fire now" otherwise.
        if (w.autofire && w.volleys < bp.chargeLevels) continue;
        this.fire(ship, w.slot);
      }
    }
  }

  private fire(ship: ShipState, slot: number): void {
    const st = this.state;
    const w = ship.weapons[slot];
    const bp = this.wbp(w.bp);
    const target = w.target!;
    const enemy = st.ships[1 - ship.idx];
    const g = this.geo(enemy);
    ship.missiles -= bp.missiles;
    const shots = bp.type === "BEAM" ? 1 : bp.shots * w.volleys;
    const dmgBonus = bp.boost?.type === "damage" ? bp.boost.amount * w.boost : 0;
    for (let i = 0; i < shots; i++) {
      let px = 0;
      let py = 0;
      if (target.kind === "room") {
        const tiles = g.roomTiles.get(target.room)!;
        if (bp.type === "BURST") {
          const r = g.layout.rooms.find((q) => q.id === target.room)!;
          const ang = this.rng.next() * Math.PI * 2;
          const rad = Math.sqrt(this.rng.next()) * (bp.radius || 40);
          px = (r.x + r.w / 2) * TILE + Math.cos(ang) * rad;
          py = (r.y + r.h / 2) * TILE + Math.sin(ang) * rad;
        } else {
          const [tx, ty] = unkey(this.rng.pick(tiles));
          px = (tx + 0.5) * TILE;
          py = (ty + 0.5) * TILE;
        }
      }
      const p: Projectile = {
        id: st.nextId++, from: ship.idx, weapon: bp.id, slot, kind: bp.type, delay: i * RULES.shotSpacing,
        t: 0, flight: RULES.flight[bp.type] ?? 1, target, px, py, damageBonus: dmgBonus,
      };
      if (bp.type === "BEAM") p.flight = RULES.beamSweep;
      st.projectiles.push(p);
    }
    ship.stats.shotsFired += shots;
    st.events.push({ e: "fire", ship: ship.idx, slot });
    this.gainXp(this.mannedBy(ship, "weapons"), "weapons");
    if (bp.boost) w.boost = Math.min(bp.boost.count, w.boost + 1);
    w.volleys = 0;
    w.charge = 0;
    if (!w.autofire) w.target = null;
  }

  private projectilesTick(first: 0 | 1): void {
    const st = this.state;
    const keep: Projectile[] = [];
    const list = [...st.projectiles.filter((p) => p.from === first), ...st.projectiles.filter((p) => p.from !== first)];
    for (const p of list) {
      if (p.delay > 0) {
        p.delay -= DT;
        keep.push(p);
        continue;
      }
      p.t += DT;
      if (p.t < p.flight) {
        keep.push(p);
        continue;
      }
      this.resolve(p);
    }
    st.projectiles = keep.sort((a, b) => a.id - b.id);
  }

  private resolve(p: Projectile): void {
    const st = this.state;
    const src = st.ships[p.from];
    const T = st.ships[1 - p.from];
    const g = this.geo(T);
    const bp = this.wbp(p.weapon);
    if (p.kind === "BEAM" && p.target.kind === "beam") return this.resolveBeam(src, T, g, bp, p.target);
    if (p.target.kind !== "room") return;
    const room = p.kind === "BURST" ? roomAt(g, p.px, p.py) : p.target.room;
    if (p.kind !== "BOMB") {
      if (room < 0 || this.rng.chance(T.evasion / 100)) {
        src.stats.misses++;
        st.events.push({ e: "miss", ship: T.idx, px: p.px, py: p.py });
        this.gainXp(this.mannedBy(T, "pilot"), "pilot");
        this.gainXp(this.mannedBy(T, "engines"), "engines");
        return;
      }
      if (T.shieldLayers > bp.sp) {
        T.shieldLayers--;
        T.shieldCharge = 0;
        if (bp.ion > 0 && T.systems.shields) this.addIon(T.systems.shields, bp.ion);
        src.stats.blocked++;
        st.events.push({ e: "shield", ship: T.idx, px: p.px, py: p.py });
        this.gainXp(this.mannedBy(T, "shields"), "shields");
        return;
      }
    }
    src.stats.hits++;
    this.hitRoom(src, T, g, bp, room, bp.damage + p.damageBonus, p.px, p.py, true);
  }

  private resolveBeam(src: ShipState, T: ShipState, g: Geometry, bp: WeaponBP, t: Extract<WeaponTarget, { kind: "beam" }>): void {
    const st = this.state;
    const dx = t.x2 - t.x1;
    const dy = t.y2 - t.y1;
    const len = Math.hypot(dx, dy) || 1;
    const L = bp.length || 60;
    const x2 = t.x1 + (dx / len) * L;
    const y2 = t.y1 + (dy / len) * L;
    const dmg = bp.damage - T.shieldLayers;
    const blocked = dmg <= 0 && (bp.damage > 0 || T.shieldLayers > 0);
    st.events.push({ e: "beam", ship: T.idx, x1: t.x1, y1: t.y1, x2, y2, blocked });
    if (blocked) {
      src.stats.blocked++;
      return;
    }
    const rooms: number[] = [];
    for (let s = 0; s <= L; s += 4) {
      const r = roomAt(g, t.x1 + (dx / len) * s, t.y1 + (dy / len) * s);
      if (r >= 0 && !rooms.includes(r)) rooms.push(r);
    }
    if (rooms.length) src.stats.hits++;
    else src.stats.misses++;
    for (const r of rooms) this.hitRoom(src, T, g, bp, r, Math.max(0, dmg), t.x1, t.y1, false);
  }

  private addIon(s: SystemState, n: number): void {
    s.ion = Math.min(s.level, s.ion + n);
    s.ionTimer = RULES.ionDuration;
  }

  private hitRoom(src: ShipState, T: ShipState, g: Geometry, bp: WeaponBP, room: number, dmg: number, px: number, py: number, rollHazards: boolean): void {
    const st = this.state;
    const sys = Object.values(T.systems).find((s) => s && s.room === room);
    let hullDmg = bp.type === "BOMB" ? 0 : dmg;
    if (bp.hullBust && !sys) hullDmg *= 2;
    if (hullDmg > 0) {
      const floor = st.config.winCondition === "crew" ? 1 : 0;
      const before = T.hull;
      T.hull = Math.max(floor, T.hull - hullDmg);
      src.stats.damageDealt += before - T.hull;
    }
    if (sys) {
      const sd = dmg + bp.sysDamage;
      if (sd > 0) {
        sys.damage = Math.min(sys.level, sys.damage + sd);
        sys.repair = 0;
      }
      if (bp.ion > 0) this.addIon(sys, bp.ion);
    }
    const pers = (dmg + bp.persDamage) * RULES.crewDamagePerPoint;
    const roomTiles = new Set(g.roomTiles.get(room));
    for (const c of T.crew) {
      if (c.dead || !roomTiles.has(c.tile)) continue;
      c.hp = Math.min(c.maxHp, c.hp - pers);
      if (bp.stunChance > 0 && this.rng.chance(bp.stunChance / 10)) c.stun = bp.stun || RULES.defaultStun;
    }
    const rs = T.rooms.find((r) => r.id === room)!;
    const tiles = g.roomTiles.get(room)!;
    if (bp.fireChance > 0 && this.rng.chance(bp.fireChance / 10)) {
      const t = this.rng.pick(tiles);
      if (!(t in rs.fires)) {
        rs.fires[t] = RULES.fireHp;
        st.events.push({ e: "fireStart", ship: T.idx, room });
      }
    }
    if (rollHazards && bp.breachChance > 0 && this.rng.chance(bp.breachChance / 10)) {
      const t = this.rng.pick(tiles);
      if (!(t in rs.breaches)) {
        rs.breaches[t] = 100;
        st.events.push({ e: "breach", ship: T.idx, room });
      }
    }
    st.events.push({ e: "hit", ship: T.idx, room, damage: hullDmg, px, py });
  }

  // ---------------------------------------------------------------- crew

  private crewTick(ship: ShipState): void {
    const g = this.geo(ship);
    const medbay = ship.systems.medbay;
    const heal = RULES.medbayHeal[Math.min(3, this.eff(medbay))];
    for (const c of ship.crew) {
      if (c.dead) continue;
      const room = g.tiles.get(c.tile)!.room;
      const rs = ship.rooms.find((r) => r.id === room)!;
      // Hazards
      if (c.tile in rs.fires) c.hp -= RULES.fireCrewDps * DT;
      if (rs.o2 < RULES.suffocateAt) c.hp -= RULES.suffocateDps * DT;
      if (medbay && medbay.room === room && heal > 0 && c.path.length === 0) c.hp = Math.min(c.maxHp, c.hp + heal * DT);
      if (c.hp <= 0) {
        c.dead = true;
        c.hp = 0;
        c.path = [];
        this.state.events.push({ e: "death", ship: ship.idx, crew: c.id });
        continue;
      }
      if (c.stun > 0) {
        c.stun -= DT;
        continue;
      }
      // Movement
      if (c.path.length) {
        const [nx, ny] = unkey(c.path[0]);
        const ddx = nx - c.x;
        const ddy = ny - c.y;
        const d = Math.hypot(ddx, ddy);
        const stepLen = RULES.crewSpeed * DT;
        if (d <= stepLen) {
          c.x = nx;
          c.y = ny;
          c.tile = c.path.shift()!;
        } else {
          c.x += (ddx / d) * stepLen;
          c.y += (ddy / d) * stepLen;
        }
        c.task = "walk";
        continue;
      }
      // Work in the current room, FTL's priority order: fire, breach, system repair, station.
      const fires = Object.keys(rs.fires);
      const breaches = Object.keys(rs.breaches);
      const sys = Object.values(ship.systems).find((s) => s && s.room === room);
      if (fires.length) {
        const t = fires.includes(c.tile) ? c.tile : fires[0];
        rs.fires[t] -= RULES.firefight * DT;
        if (rs.fires[t] <= 0) delete rs.fires[t];
        c.task = "fire";
      } else if (breaches.length) {
        const t = breaches[0];
        rs.breaches[t] -= RULES.breachRepair * DT;
        if (rs.breaches[t] <= 0) delete rs.breaches[t];
        c.task = "breach";
      } else if (sys && sys.damage > 0) {
        sys.repair += RULES.repairRate * (1 + RULES.repairSkillBonus[this.skill(c, "repair")]) * DT;
        if (sys.repair >= 1) {
          sys.repair = 0;
          sys.damage--;
          this.gainXp(c, "repair");
        }
        c.task = "repair";
      } else if (sys && sys.station === c.tile && MANNABLE.includes(sys.id)) c.task = "man";
      else if (medbay && medbay.room === room && c.hp < c.maxHp) c.task = "heal";
      else c.task = "idle";
    }
  }

  // ---------------------------------------------------------------- fire, breaches, oxygen

  private environmentTick(ship: ShipState): void {
    const g = this.geo(ship);
    const ox = this.eff(ship.systems.oxygen);
    const byId = new Map(ship.rooms.map((r) => [r.id, r]));
    for (const rs of ship.rooms) {
      const tiles = g.roomTiles.get(rs.id)!;
      if (ox > 0) rs.o2 += RULES.o2Refill[Math.min(3, ox)] * DT;
      else rs.o2 -= RULES.o2Drain * DT;
      const nb = Object.keys(rs.breaches).length;
      if (nb) rs.o2 -= RULES.breachDrain * nb * (4 / tiles.length) * DT;
      const fireTiles = Object.keys(rs.fires);
      rs.o2 -= RULES.fireO2Use * fireTiles.length * DT;
      // Fire: starve, spread, burn the room's system.
      for (const t of fireTiles) {
        if (rs.o2 < RULES.fireMinO2) {
          rs.fires[t] -= RULES.fireStarve * DT;
          if (rs.fires[t] <= 0) {
            delete rs.fires[t];
            continue;
          }
        }
        if (this.rng.chance(RULES.fireSpreadPerSec * DT)) {
          const opts = (g.adj.get(t) ?? []).filter((e) => e.door < 0 || ship.doors[e.door]);
          if (opts.length) {
            const to = this.rng.pick(opts).to;
            const tr = byId.get(g.tiles.get(to)!.room)!;
            if (!(to in tr.fires) && tr.o2 >= RULES.fireMinO2) {
              tr.fires[to] = RULES.fireHp;
              if (tr !== rs) this.state.events.push({ e: "fireStart", ship: ship.idx, room: tr.id });
            }
          }
        }
      }
      const sys = Object.values(ship.systems).find((s) => s && s.room === rs.id);
      const burning = Object.keys(rs.fires).length;
      if (sys && burning) {
        sys.fireDmg += (DT * burning) / RULES.fireSysSeconds;
        if (sys.fireDmg >= 1) {
          sys.fireDmg = 0;
          if (sys.damage < sys.level) {
            sys.damage++;
            sys.repair = 0;
          }
        }
      }
    }
    // Doors: open interior doors equalise O2, open airlocks vent to space.
    g.doors.forEach((d, i) => {
      if (!ship.doors[i]) return;
      const a = d.roomA >= 0 ? byId.get(d.roomA) : undefined;
      const b = d.roomB >= 0 ? byId.get(d.roomB) : undefined;
      if (a && b) {
        const f = (a.o2 - b.o2) * RULES.doorFlow * DT * 0.5;
        a.o2 -= f;
        b.o2 += f;
      } else (a ?? b)!.o2 -= RULES.ventDrain * DT;
    });
    for (const rs of ship.rooms) rs.o2 = Math.max(0, Math.min(100, rs.o2));
  }

  // ---------------------------------------------------------------- end of match

  private checkEnd(): void {
    const st = this.state;
    const lost = st.ships.map((s) => {
      if (st.config.winCondition === "hull" && s.hull <= 0) return "ship destroyed";
      if (s.crew.every((c) => c.dead)) return "crew lost";
      return "";
    });
    if (lost[0] || lost[1]) {
      st.winner = lost[0] && lost[1] ? -1 : lost[0] ? 1 : 0;
      st.endReason = lost[0] && lost[1] ? `both: ${lost[0]} / ${lost[1]}` : (lost[0] || lost[1]);
    } else if (st.config.timeLimit > 0 && st.tick >= st.config.timeLimit * TICK_HZ) {
      const score = (s: ShipState) =>
        st.config.winCondition === "crew" ? s.crew.filter((c) => !c.dead).length : s.hull / s.maxHull;
      const a = score(st.ships[0]);
      const b = score(st.ships[1]);
      st.winner = a === b ? -1 : a > b ? 0 : 1;
      st.endReason = "time limit";
    }
    if (st.winner !== null) st.events.push({ e: "end", winner: st.winner, reason: st.endReason });
  }

  /** Stable hash of the whole state, for determinism checks. */
  hash(): string {
    const s = JSON.stringify({ ...this.state, events: [] });
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  }
}

export { autoPower, key };
