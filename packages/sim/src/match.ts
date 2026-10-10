/**
 * The authoritative simulation. Pure: no clocks, no I/O. `step()` advances one tick (1/30 s); commands are
 * applied at the start of the tick they're queued for. Same seed + same commands = same state.
 */
import { ARTILLERY_IDS, SPACE_DRONES, UNIT_DRONES, type GameDB, type SystemId, type WeaponBP } from "@ftl/data";
import type { Command } from "./commands.ts";
import { findPath, geometry, key, roomAt, roomCentre, unkey, type Geometry } from "./geometry.ts";
import { augCount, autoPower, buildShip, isSubsystem, reactorUsed, usable, type Loadout } from "./loadout.ts";
import { Rng } from "./rng.ts";
import { DT, raceOf, RULES, TICK_HZ, TILE, type SkillId } from "./rules.ts";
import type {
  CrewState, DroneState, MatchConfig, MatchEvent, MatchState, Projectile, ShipState, SystemState, WeaponTarget,
} from "./state.ts";

const HACK_OFF: SystemId[] = ["shields", "engines", "pilot", "sensors", "cloaking", "hacking", "teleporter", "clonebay", "mind"];
const MANNABLE: SystemId[] = ["pilot", "engines", "shields", "weapons", "sensors", "doors"];

export class Match {
  state: MatchState;
  private rng: Rng;
  private queue: { player: 0 | 1; cmd: Command }[] = [];
  /** Debug: ships whose hull and crew can't drop below 1. */
  god = new Set<0 | 1>();

  constructor(public db: GameDB, config: MatchConfig, loadouts: [Loadout, Loadout], players: [string, string]) {
    this.rng = new Rng(config.seed);
    // Crystal Vengeance shards fly as a 1-damage, 1-pierce laser.
    if (!db.weapons.__SHARD) {
      db.weapons.__SHARD = {
        id: "__SHARD", title: "Crystal shard", type: "LASER", damage: 1, shots: 1, sp: 1, fireChance: 0, breachChance: 0, stunChance: 0,
        ion: 0, sysDamage: 0, persDamage: 0, hullBust: false, cooldown: 1, power: 0, cost: 0, missiles: 0, length: 0, radius: 0, speed: 0,
        stun: 0, image: "crystal_1", weaponArt: "", rarity: 0, chargeLevels: 1,
      };
    }
    const used = new Set<string>();
    const pick = (n: string[]) => {
      const free = n.filter((x) => !used.has(x));
      const name = free.length ? free[this.rng.int(free.length)] : n[this.rng.int(n.length)];
      used.add(name);
      return name;
    };
    const ships: [ShipState, ShipState] = [
      buildShip(db, loadouts[0], 0, players[0], pick, config.unlimited),
      buildShip(db, loadouts[1], 1, players[1], pick, config.unlimited),
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
    m.god = new Set();
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
    for (const s of st.ships) {
      for (const x of Object.values(s.systems)) if (x) x.locked = x.hacked = false;
      s.lockedRoom = undefined;
      s.doorPass = (s.doorPass ?? s.doors.map(() => 0)).map((t) => Math.max(0, t - DT));
    }
    for (const s of order) this.hackTick(s);
    for (const s of order) this.batteryTick(s);
    for (const s of order) this.systemsTick(s);
    for (const s of order) this.weaponsTick(s);
    for (const s of order) this.artilleryTick(s);
    for (const s of order) this.mindTick(s);
    for (const s of order) this.dronesTick(s);
    for (const s of order) this.teleTick(s);
    for (const s of order) this.cloakTick(s);
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
        // An ionised or hacked system is locked: power can neither enter nor leave it.
        if (!s || isSubsystem(s.id) || s.ion > 0 || s.locked) return false;
        if (cmd.delta > 0) {
          if (reactorUsed(ship) >= this.cap(ship) || s.power >= usable(s)) return false;
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
        if (!w || !ws || ws.ion > 0 || ws.locked) return false;
        if (!cmd.on) {
          if (!w.powered) return false;
          w.powered = false;
          ws.power = Math.max(0, ws.power - this.wbp(w.bp).power);
          return true;
        }
        if (w.powered) return false;
        const need = this.weaponLoad(ship) + this.wbp(w.bp).power;
        if (need > usable(ws)) return false;
        const extra = need - ws.power - (ws.bonus ?? 0);
        if (extra > 0) {
          if (reactorUsed(ship) + extra > this.cap(ship)) return false;
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
        // Crew walk inside whichever ship they're aboard: own crew at home, or boarders on the enemy ship.
        const aboard = cmd.enemy ? this.state.ships[1 - ship.idx] : ship;
        const g = this.geo(aboard);
        if (!g.roomTiles.has(cmd.room)) return false;
        for (const id of cmd.crew) {
          const c = aboard.crew.find((q) => q.id === id && !q.dead && q.dying === undefined && q.owner === ship.idx && q.drone === undefined && !q.mind);
          if (c) this.sendCrew(aboard, g, c, cmd.room);
        }
        return true;
      }
      case "cloak":
        return this.startCloak(ship);
      case "battery":
        return this.startBattery(ship);
      case "mind":
        return this.mindControl(ship, cmd.room, cmd.enemy);
      case "artilleryTarget": {
        const T = this.state.ships[1 - ship.idx];
        if (cmd.room !== null && !this.geo(T).roomTiles.has(cmd.room)) return false;
        ship.artilleryTarget = cmd.room;
        return true;
      }
      case "hackLaunch":
        return this.hackLaunch(ship, cmd.room);
      case "hackPulse":
        return this.startPulse(ship);
      case "teleport":
      case "retrieve":
        return this.teleport(ship, cmd.room, cmd.c === "teleport");
      case "dronePower": {
        const d = ship.drones?.[cmd.slot];
        const ds = ship.systems.drones;
        const bp = d && this.db.droneBPs?.[d.bp];
        if (!d || !ds || !bp || ds.ion > 0 || ds.locked) return false;
        if (!cmd.on) {
          if (!d.powered) return false;
          d.powered = false;
          d.deployed = false;
          this.removeUnit(ship.idx, cmd.slot);
          ds.power = Math.max(0, ds.power - bp.power);
          return true;
        }
        if (d.powered || !SPACE_DRONES.includes(bp.type) || (d.rebuild ?? 0) > 0) return false;
        const need = this.droneLoad(ship) + bp.power;
        if (need > usable(ds)) return false;
        const extra = need - ds.power - (ds.bonus ?? 0);
        if (extra > 0) {
          if (reactorUsed(ship) + extra > this.cap(ship)) return false;
          ds.power += extra;
        }
        d.powered = true;
        d.launch = RULES.droneLaunch;
        return true;
      }
      case "swapWeapons": {
        const { a, b } = cmd;
        if (a === b || !ship.weapons[a] || !ship.weapons[b]) return false;
        [ship.weapons[a], ship.weapons[b]] = [ship.weapons[b], ship.weapons[a]];
        ship.weapons[a].slot = a;
        ship.weapons[b].slot = b;
        return true;
      }
      case "door":
      case "doorsAll": {
        const d = ship.systems.doors;
        if (d && (this.eff(d) <= 0 || d.hacked)) return false;
        if (cmd.c === "door") {
          if (cmd.door < 0 || cmd.door >= ship.doors.length) return false;
          if (cmd.open && this.doorLocked(ship, cmd.door)) return false;
          ship.doors[cmd.door] = cmd.open;
        } else {
          const g = this.geo(ship);
          const airlock = (i: number) => g.doors[i].roomA === -1 || g.doors[i].roomB === -1;
          // FTL's door button: the first "open" opens the interior doors; pressed again with them all
          // open, it opens the airlocks too (venting the ship). "Close" shuts everything.
          const interiorOpen = ship.doors.every((o, i) => airlock(i) || o || this.doorLocked(ship, i));
          ship.doors = ship.doors.map((o, i) => (!cmd.open || this.doorLocked(ship, i) ? false : airlock(i) ? o || interiorOpen : true));
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
    // A tile holds one crew member per side (FTL lets a defender and an intruder share it).
    const claimed = new Set(ship.crew.filter((q) => !q.dead && q !== c && q.owner === c.owner).map((q) => q.home));
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

  /** A door is open when set open, or while it's held open (crew passing, broken). */
  doorOpen(ship: ShipState, i: number): boolean {
    return ship.doors[i] || (ship.doorPass?.[i] ?? 0) > 0;
  }

  /** Doors of the room an enemy hacking drone has locked. */
  private doorLocked(ship: ShipState, i: number): boolean {
    if (ship.lockedRoom === undefined) return false;
    const d = this.geo(ship).doors[i];
    return !!d && (d.roomA === ship.lockedRoom || d.roomB === ship.lockedRoom);
  }

  eff(s: SystemState | undefined): number {
    if (!s) return 0;
    // A hacking pulse shuts these down outright (FTL's hack_* texts); the rest are handled where they act.
    if (s.hacked && HACK_OFF.includes(s.id)) return 0;
    // A manned subsystem (sensors, doors) works one level up while it has any power.
    if (isSubsystem(s.id)) return usable(s) > 0 ? usable(s) + (s.manBonus ?? 0) : 0;
    return Math.min(s.power + (s.bonus ?? 0), usable(s));
  }

  private weaponLoad(ship: ShipState): number {
    return ship.weapons.filter((w) => w.powered).reduce((a, w) => a + this.wbp(w.bp).power, 0);
  }

  private droneLoad(ship: ShipState): number {
    return (ship.drones ?? []).filter((d) => d.powered).reduce((a, d) => a + (this.db.droneBPs?.[d.bp]?.power ?? 1), 0);
  }

  /** Losing drone power recalls drones from the last slot back (the deployed drone is lost). */
  private clampDrones(ship: ShipState): void {
    const cap = this.eff(ship.systems.drones);
    const ds = ship.drones ?? [];
    for (let i = ds.length - 1; i >= 0 && this.droneLoad(ship) > cap; i--) {
      if (!ds[i].powered) continue;
      ds[i].powered = false;
      if (ds[i].deployed) this.state.events.push({ e: "droneLost", ship: ship.idx, drone: i });
      ds[i].deployed = false;
      this.removeUnit(ship.idx, i);
    }
  }

  private dronesTick(ship: ShipState): void {
    const st = this.state;
    this.clampDrones(ship);
    const enemy = st.ships[1 - ship.idx];
    const scrambled = augCount(enemy, "DEFENSE_SCRAMBLER") > 0;
    const boost = augCount(ship, "DRONE_SPEED") ? 1 + (this.db.augments?.DRONE_SPEED?.value ?? 0.25) : 1;
    const frozen = !!ship.systems.drones?.hacked;
    for (const d of ship.drones ?? []) if ((d.rebuild ?? 0) > 0) d.rebuild = Math.max(0, d.rebuild! - DT);
    for (const d of ship.drones ?? []) {
      const bp = this.db.droneBPs?.[d.bp];
      if (!bp || !d.powered || frozen) continue;
      if (!d.deployed) {
        // A powered drone launches after a moment, using a drone part.
        if ((d.launch ?? 0) > 0) {
          d.launch = (d.launch ?? 0) - DT;
          continue;
        }
        if ((ship.droneParts ?? 0) <= 0) continue;
        if (UNIT_DRONES.includes(bp.type) && !this.launchUnit(ship, enemy, d, bp.id, bp.type)) continue;
        ship.droneParts = (ship.droneParts ?? 0) - 1;
        d.deployed = true;
        d.cd = 1.2;
        d.repairLeft = bp.type === "SHIP_REPAIR" ? RULES.shipRepairAmount : undefined;
      }
      if (UNIT_DRONES.includes(bp.type)) continue;
      d.angle += DT * (0.25 + bp.speed * 0.02) * boost;
      d.cd -= DT * boost;
      if (d.cd > 0) continue;
      if (bp.type === "COMBAT") {
        d.cd = (RULES.combatFire * 15) / Math.max(1, bp.speed);
        this.droneShot(ship, enemy, d, bp.weapon);
      } else if (bp.type === "DEFENSE") {
        d.cd = bp.cooldown;
        if (scrambled) continue;
        if (bp.antiDrone) {
          // Anti-drone: knocks out one enemy space drone.
          const target = (enemy.drones ?? []).find((x) => x.deployed && !UNIT_DRONES.includes(this.db.droneBPs?.[x.bp]?.type ?? "COMBAT"));
          if (target) {
            target.deployed = false;
            st.events.push({ e: "droneLost", ship: enemy.idx, drone: target.slot });
          } else d.cd = 0.5;
          continue;
        }
        const lasersToo = bp.id !== "DEFENSE_1";
        const incoming = st.projectiles
          .filter((p) => p.from === enemy.idx && p.delay <= 0 && p.flight - p.t > RULES.interceptMin && (p.kind === "MISSILES" || p.kind === "BOARDER" || p.kind === "HACK" || (lasersToo && (p.kind === "LASER" || p.kind === "BURST"))))
          .sort((a, b) => a.flight - a.t - (b.flight - b.t))[0];
        if (incoming) {
          st.projectiles = st.projectiles.filter((p) => p !== incoming);
          if (incoming.boarder !== undefined) this.loseDrone(enemy, incoming.boarder);
          if (incoming.kind === "HACK") enemy.hack = undefined;
          st.events.push({ e: "intercept", ship: ship.idx, projectile: incoming.id, drone: d.slot });
        } else d.cd = 0.1;
      } else if (bp.type === "SHIELD") {
        // Shield Overcharger: tops up the Zoltan-style super shield one point at a time.
        d.cd = bp.cooldown;
        ship.superShield = Math.min(RULES.shieldDroneMax, (ship.superShield ?? 0) + 1);
      } else if (bp.type === "SHIP_REPAIR") {
        d.cd = RULES.shipRepairEvery;
        if (ship.hull < ship.maxHull && (d.repairLeft ?? 0) > 0) {
          ship.hull++;
          d.repairLeft = (d.repairLeft ?? 0) - 1;
          if ((d.repairLeft ?? 0) <= 0) this.loseDrone(ship, d.slot, false); // spent: power it again for another
        }
      }
    }
  }

  /** A combat drone fires its weapon at a random room (lasers/ions) or sweeps a beam. */
  private droneShot(ship: ShipState, enemy: ShipState, d: DroneState, weapon: string): void {
    const st = this.state;
    const bp = this.wbp(weapon);
    if (!bp) return;
    const g = this.geo(enemy);
    const room = this.rng.pick(enemy.rooms).id;
    let target: WeaponTarget = { kind: "room", room };
    let px = 0;
    let py = 0;
    if (bp.type === "BEAM") {
      const c = roomCentre(g, room);
      const a = this.rng.next() * Math.PI * 2;
      target = { kind: "beam", x1: c.x, y1: c.y, x2: c.x + Math.cos(a) * 100, y2: c.y + Math.sin(a) * 100 };
    } else {
      const [tx, ty] = unkey(this.rng.pick(g.roomTiles.get(room)!));
      px = (tx + 0.5) * TILE;
      py = (ty + 0.5) * TILE;
    }
    st.projectiles.push({
      id: st.nextId++, drone: d.slot, from: ship.idx, weapon, slot: -1, kind: bp.type, delay: 0, t: 0,
      flight: bp.type === "BEAM" ? RULES.beamSweep : RULES.droneFlight, target, px, py, damageBonus: 0,
    });
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
    return ship.crew.find((c) => !c.dead && !c.dying && c.owner === ship.idx && c.drone === undefined && !c.mind && c.stun <= 0 && c.path.length === 0 && c.tile === s.station);
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
    const g = this.geo(ship);
    for (const s of Object.values(ship.systems)) {
      if (!s) continue;
      s.bonus = 0;
      s.manBonus = 0;
      if ((s.id === "sensors" || s.id === "doors") && s.station && usable(s) > 0) {
        if (this.mannedBy(ship, s.id)) s.manBonus = 1;
      }
      for (const c of ship.crew) {
        const p = raceOf(c.race).power;
        if (p && !c.dead && c.owner === ship.idx && c.path.length === 0 && g.tiles.get(c.tile)?.room === s.room) s.bonus += p;
      }
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
      const bonus = (m ? RULES.shieldManBonus[this.skill(m, "shields")] : 0) + augCount(ship, "SHIELD_RECHARGE") * (this.db.augments?.SHIELD_RECHARGE?.value ?? 0.15);
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
    ship.evasion = Math.min(100, this.evasionOf(ship) + ((ship.cloak?.t ?? 0) > 0 ? RULES.cloakEvasion : 0));
  }

  // ---------------------------------------------------------------- weapons and projectiles

  /**
   * The charge ceiling: FTL doesn't charge faster when manned or chained; the target comes down. Manned
   * weapons take 10/15/20 % off by skill; chain weapons take `amount` off per boost.
   */
  cooldownOf(ship: ShipState, slot: number): number {
    const w = ship.weapons[slot];
    const bp = this.wbp(w.bp);
    let cd = bp.cooldown;
    const m = this.mannedBy(ship, "weapons");
    if (m) cd *= 1 - RULES.weaponManBonus[this.skill(m, "weapons")];
    cd *= Math.pow(1 - (this.db.augments?.AUTO_COOLDOWN?.value ?? 0.1), augCount(ship, "AUTO_COOLDOWN"));
    if (bp.boost?.type === "cooldown") cd = Math.max(1, cd - bp.boost.amount * w.boost);
    return cd;
  }

  private weaponsTick(ship: ShipState): void {
    // FTL: while the enemy is cloaked, weapons stop charging and aiming. A hacked weapons system drains.
    const enemyCloaked = (this.state.ships[1 - ship.idx].cloak?.t ?? 0) > 0;
    const drained = !!ship.systems.weapons?.hacked;
    for (const w of ship.weapons) {
      const bp = this.wbp(w.bp);
      const cd = this.cooldownOf(ship, w.slot);
      w.cd = cd;
      const rate = 1;
      if (!w.powered) {
        w.charge = Math.max(0, w.charge - DT * RULES.weaponDrain);
        w.volleys = 0;
        w.boost = 0;
        continue;
      }
      if (drained) {
        w.volleys = 0;
        w.charge = Math.max(0, w.charge - DT * RULES.hackWeaponDrain);
        continue;
      }
      if (enemyCloaked) continue;
      if (w.volleys < bp.chargeLevels) {
        w.charge = Math.min(cd, w.charge + DT * rate);
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
    // Explosive Replicator: missile weapons have a chance not to use a missile.
    if (!(bp.missiles > 0 && augCount(ship, "EXPLOSIVE_REPLICATOR") && this.rng.chance(this.db.augments?.EXPLOSIVE_REPLICATOR?.value ?? 0.5))) ship.missiles -= bp.missiles;
    const shots = this.launch(ship, bp, target, w.volleys, slot, bp.boost?.type === "damage" ? bp.boost.amount * w.boost : 0);
    this.gainXp(this.mannedBy(ship, "weapons"), "weapons");
    if (bp.boost) w.boost = Math.min(bp.boost.count, w.boost + 1);
    w.volleys = 0;
    w.charge = 0;
    if (!w.autofire) w.target = null;
  }

  /** Put a volley in the air (weapons and artillery): shots spaced out, aimed at tiles or flak spread. */
  private launch(ship: ShipState, bp: WeaponBP, target: WeaponTarget, volleys: number, slot: number, dmgBonus: number): number {
    const st = this.state;
    const enemy = st.ships[1 - ship.idx];
    const g = this.geo(enemy);
    const shots = bp.type === "BEAM" ? 1 : bp.shots * Math.max(1, volleys);
    // Firing while cloaked disrupts the cloak, unless Stealth Weapons is fitted.
    if ((ship.cloak?.t ?? 0) > 0 && !augCount(ship, "CLOAK_FIRE")) ship.cloak!.t = Math.max(0.05, ship.cloak!.t - RULES.cloakFirePenalty);
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
    return shots;
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
    if (p.kind === "BOARDER") return this.landBoarder(src, T, p);
    if (p.kind === "HACK") return this.landHack(src, T, p);
    const bp = this.wbp(p.weapon);
    if (p.kind === "BEAM" && p.target.kind === "beam") return this.resolveBeam(src, T, g, bp, p.target);
    if (p.target.kind !== "room") return;
    const room = p.kind === "BURST" ? roomAt(g, p.px, p.py) : p.target.room;
    // Zoltan Shield absorbs anything that would reach the ship (bombs included) until it's used up.
    const bypass = p.kind === "BOMB" && augCount(src, "ZOLTAN_BYPASS") > 0;
    if (!bypass && (T.superShield ?? 0) > 0 && room >= 0 && (p.kind === "BOMB" || !this.rng.chance(T.evasion / 100))) {
      T.superShield = Math.max(0, (T.superShield ?? 0) - Math.max(1, bp.damage + bp.ion));
      src.stats.blocked++;
      st.events.push({ e: "shield", ship: T.idx, px: p.px, py: p.py });
      return;
    }
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
        if (bp.ion > 0 && T.systems.shields && !this.ionNegated(T)) this.addIon(T.systems.shields, bp.ion);
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
    if ((T.superShield ?? 0) > 0) {
      T.superShield = Math.max(0, (T.superShield ?? 0) - Math.max(1, bp.damage));
      st.events.push({ e: "beam", ship: T.idx, x1: t.x1, y1: t.y1, x2, y2, blocked: true });
      src.stats.blocked++;
      return;
    }
    // Each shield layer takes a point off a beam, less the weapon's piercing (the Fed artillery pierces all).
    const layers = Math.max(0, T.shieldLayers - (bp.sp ?? 0));
    const dmg = bp.damage - layers;
    const blocked = dmg <= 0 && (bp.damage > 0 || layers > 0);
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

  /** Reverse Ion Field: each copy is a chance to negate ion damage entirely. */
  private ionNegated(T: ShipState): boolean {
    const n = augCount(T, "ION_ARMOR");
    return n > 0 && this.rng.chance(1 - Math.pow(1 - (this.db.augments?.ION_ARMOR?.value ?? 0.5), n));
  }

  private addIon(s: SystemState, n: number): void {
    s.ion = Math.min(s.level, s.ion + n);
    s.ionTimer = RULES.ionDuration;
  }

  private hitRoom(src: ShipState, T: ShipState, g: Geometry, bp: WeaponBP, room: number, dmg: number, px: number, py: number, rollHazards: boolean): void {
    const st = this.state;
    const sys = Object.values(T.systems).find((s) => s && s.room === room);
    if (this.god.has(T.idx)) {
      // God mode: nothing harms this ship or its crew.
      st.events.push({ e: "hit", ship: T.idx, room, damage: 0, px, py });
      return;
    }
    let hullDmg = bp.type === "BOMB" ? 0 : dmg;
    if (bp.hullBust && !sys) hullDmg *= 2;
    // Rock Plating: a chance to negate hull damage (systems are still hit).
    if (hullDmg > 0 && augCount(T, "ROCK_ARMOR") && this.rng.chance(this.db.augments?.ROCK_ARMOR?.value ?? 0.15)) hullDmg = 0;
    if (hullDmg > 0) {
      const floor = st.config.winCondition === "crew" ? 1 : 0;
      const before = T.hull;
      T.hull = Math.max(floor, T.hull - hullDmg);
      src.stats.damageDealt += before - T.hull;
      // Crystal Vengeance: a chance for a shard to break off and fly back at the attacker.
      if (augCount(T, "CRYSTAL_SHARDS") && this.rng.chance(this.db.augments?.CRYSTAL_SHARDS?.value ?? RULES.shardChance)) {
        const back = st.ships[src.idx];
        const r = this.rng.pick(back.rooms).id;
        st.projectiles.push({
          id: st.nextId++, from: T.idx, weapon: "__SHARD", slot: -1, kind: "LASER", delay: 0, t: 0, flight: RULES.flight.LASER,
          target: { kind: "room", room: r }, px: 0, py: 0, damageBonus: 0,
        });
      }
    }
    if (sys) {
      const sd = dmg + bp.sysDamage;
      // Titanium System Casing: a chance to negate system damage.
      const casing = augCount(T, "SYSTEM_CASING") && this.rng.chance(this.db.augments?.SYSTEM_CASING?.value ?? 0.15);
      if (sd > 0 && !casing) {
        sys.damage = Math.min(sys.level, sys.damage + sd);
        sys.repair = 0;
      }
      if (bp.ion > 0 && !this.ionNegated(T)) this.addIon(sys, bp.ion);
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
    // At most one breach per room.
    if (rollHazards && bp.breachChance > 0 && !Object.keys(rs.breaches).length && this.rng.chance(bp.breachChance / 10)) {
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
    const st = this.state;
    const g = this.geo(ship);
    const medbay = ship.systems.medbay;
    const heal = RULES.medbayHeal[Math.min(3, this.eff(medbay))];
    const cb = ship.systems.clonebay;
    const dna = augCount(ship, "BACKUP_DNA") > 0;
    const doorLevel = Math.min(RULES.doorBreak.length - 1, this.eff(ship.systems.doors));
    this.refillStations(ship, g);
    /** Boarders who died here go home to their owner's ship (its clone bay may bring them back). */
    const leaving: CrewState[] = [];
    /** Crew whose beam-out finished: moved aboard the other ship after the loop. */
    const moving: [CrewState, ShipState, string][] = [];
    for (const c of ship.crew) {
      if (c.dead && c.clone !== undefined) {
        // Clone bay: progress while powered; without power the queue is lost unless Backup DNA keeps it.
        const p = this.eff(cb);
        if (p > 0) c.clone += DT / RULES.cloneTime[Math.min(3, p)];
        else if (!dna) c.clone = undefined;
        if (c.clone !== undefined && c.clone >= 1 && cb) this.respawn(ship, g, c, cb.room);
        continue;
      }
      if (c.dead) continue;
      const home = st.ships[c.owner];
      if (c.dying !== undefined) {
        // The death animation plays out before the crew member counts as dead.
        c.dying -= DT;
        if (c.dying <= 0) {
          c.dead = true;
          c.dying = undefined;
          if (c.mind) this.release(c);
          const ocb = st.ships[c.owner].systems.clonebay;
          if (c.drone === undefined && ocb && ocb.level > 0) c.clone = 0;
          st.events.push({ e: "death", ship: ship.idx, crew: c.id });
          if (c.drone !== undefined || c.owner !== ship.idx) leaving.push(c);
          continue;
        }
        continue;
      }
      const room = g.tiles.get(c.tile)!.room;
      const rs = ship.rooms.find((r) => r.id === room)!;
      const ownShip = c.owner === ship.idx;
      // Hazards
      const tr = raceOf(c.race);
      if (c.tile in rs.fires && !tr.fireImmune) c.hp -= RULES.fireCrewDps * DT;
      // Emergency Respirators (the owner's augment) halve suffocation damage.
      const masks = augCount(home, "O2_MASKS") ? (this.db.augments?.O2_MASKS?.value ?? 0.5) : 1;
      if (rs.o2 < RULES.suffocateAt) c.hp -= RULES.suffocateDps * tr.suffocation * masks * DT;
      // Engi Med-bot Dispersal: slow healing anywhere aboard your own ship outside the medbay.
      if (ownShip && augCount(ship, "NANO_MEDBAY") && !(medbay && medbay.room === room) && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + RULES.nanoMedbay * DT);
      if (tr.drainO2) rs.o2 = Math.max(0, rs.o2 - RULES.breachDrain * (4 / g.roomTiles.get(room)!.length) * tr.drainO2 * DT);
      if (this.god.has(c.owner)) c.hp = c.maxHp;
      if (ownShip && medbay && !medbay.hacked && medbay.room === room && heal > 0 && c.path.length === 0) c.hp = Math.min(c.maxHp, c.hp + heal * DT);
      // Drone units repair themselves in their own drone room, like crew in a medbay.
      const dr = ship.systems.drones;
      if (ownShip && c.drone !== undefined && dr && dr.room === room && c.path.length === 0) c.hp = Math.min(c.maxHp, c.hp + RULES.medbayHeal[1] * DT);
      // A hacked medbay hurts its own crew instead (and never heals).
      if (ownShip && medbay?.hacked && medbay.room === room) c.hp -= RULES.hackMedbayDps * DT;
      if (c.hp <= 0) {
        c.hp = 0;
        c.path = [];
        c.x = Number(c.tile.split(",")[0]);
        c.y = Number(c.tile.split(",")[1]);
        c.dying = RULES.deathAnim;
        continue;
      }
      if (c.stun > 0) {
        c.stun -= DT;
        continue;
      }
      c.aim = undefined;
      // Teleporting: the beam-out plays, then they're moved across and the beam-in plays.
      if (c.beam) {
        c.beam.t -= DT;
        c.task = "idle";
        c.path = [];
        if (c.beam.t <= 0) {
          if (c.beam.phase === "out") {
            const dest = st.ships[c.beam.ship];
            const tile = c.beam.tile;
            c.beam = { t: RULES.teleportTime, phase: "in", ship: dest.idx, tile };
            if (dest !== ship) moving.push([c, dest, tile]);
          } else c.beam = undefined;
        }
        continue;
      }
      const hostiles = ship.crew.filter((q) => q.owner !== c.owner && !q.dead && q.dying === undefined && g.tiles.get(q.tile)?.room === room);
      // Drone units think for themselves (players can't order them).
      if (c.drone !== undefined && !c.path.length && !hostiles.length) this.unitThink(ship, g, c, room);
      // Movement. Intruders have to break closed doors first (longer for better doors).
      if (c.path.length) {
        const edge = g.adj.get(c.tile)?.find((e) => e.to === c.path[0]);
        const door = edge && edge.door >= 0 ? edge.door : -1;
        if (door >= 0 && !this.doorOpen(ship, door)) {
          const locked = this.doorLocked(ship, door);
          // Whose way is barred: the hacker's crew walk through locked doors; a doors-system pulse turns
          // every door into a blast door for the ship's own crew; intruders and locked-in crew break doors.
          const hackerCrew = locked && c.owner !== ship.idx;
          if (ownShip && ship.systems.doors?.hacked) {
            c.task = "idle";
            continue;
          }
          if (!hackerCrew && (!ownShip || locked)) {
            c.bash = (c.bash ?? 0) + DT * Math.max(0.5, tr.combat);
            c.task = "fight";
            const dr = g.doors[door];
            c.aim = [dr.px / TILE - 0.5, dr.py / TILE - 0.5];
            if (c.bash >= RULES.doorBreak[doorLevel]) {
              ship.doorPass![door] = RULES.doorBrokenOpen;
              c.bash = 0;
              st.events.push({ e: "doorBroken", ship: ship.idx, door });
            }
            continue;
          }
          // Anyone else opens it as they pass.
          ship.doorPass![door] = Math.max(ship.doorPass![door], RULES.doorPassOpen + 1 / (RULES.crewSpeed * tr.speed));
        }
        const [nx, ny] = unkey(c.path[0]);
        const ddx = nx - c.x;
        const ddy = ny - c.y;
        const d = Math.hypot(ddx, ddy);
        const stepLen = RULES.crewSpeed * tr.speed * (augCount(home, "CREW_STIMS") ? 1 + (this.db.augments?.CREW_STIMS?.value ?? 0.25) : 1) * DT;
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
      const sys = Object.values(ship.systems).find((s) => s && s.room === room);
      // Fighting comes first: anyone who can fight attacks a hostile in the same room.
      if (hostiles.length && tr.combat > 0) {
        const foe = hostiles.reduce((a, b) => (Math.hypot(a.x - c.x, a.y - c.y) <= Math.hypot(b.x - c.x, b.y - c.y) ? a : b));
        foe.hp -= RULES.meleeDps * tr.combat * (1 + RULES.combatSkillBonus[this.skill(c, "combat")]) * (1 + (c.mind?.boost ?? 0)) * DT;
        if (foe.hp <= 0) this.gainXp(c, "combat", 2);
        c.task = "fight";
        c.aim = [foe.x, foe.y];
        continue;
      }
      // Mind-controlled crew only fight (FTL: they turn on their crewmates, nothing else).
      if (c.mind) {
        c.task = "idle";
        continue;
      }
      if (!ownShip) {
        // Boarders wreck the system in their room (ion intruders ionise it instead).
        if (sys && (tr.ionBoarder ? sys.level > 0 : sys.damage < sys.level)) {
          c.bash = (c.bash ?? 0) + RULES.sabotageRate * Math.max(0.5, tr.combat) * (tr.sabotage ?? 1) * DT;
          if (c.bash >= 1) {
            c.bash = 0;
            if (tr.ionBoarder) this.addIon(sys, 1);
            else {
              sys.damage = Math.min(sys.level, sys.damage + 1);
              sys.repair = 0;
              this.gainXp(c, "combat");
            }
          }
          c.task = "sabotage";
        } else c.task = "idle";
        continue;
      }
      // Work in the current room, FTL's priority order: fire, breach, system repair, station.
      const fires = Object.keys(rs.fires);
      const breaches = Object.keys(rs.breaches);
      const drone = c.drone !== undefined;
      if (fires.length && !drone) {
        const t = fires.includes(c.tile) ? c.tile : fires[0];
        rs.fires[t] -= RULES.firefight * tr.repair * DT;
        if (rs.fires[t] <= 0) delete rs.fires[t];
        c.task = "fire";
      } else if (breaches.length && !drone) {
        const t = breaches[0];
        rs.breaches[t] -= (RULES.breachRepair * tr.repair * DT) / (ship.lockedRoom === room ? 2 : 1);
        if (rs.breaches[t] <= 0) delete rs.breaches[t];
        c.task = "breach";
      } else if (sys && sys.damage > 0 && tr.repair > 0) {
        sys.repair += (RULES.repairRate * tr.repair * (1 + RULES.repairSkillBonus[this.skill(c, "repair")]) * DT) / (ship.lockedRoom === room ? 2 : 1);
        if (sys.repair >= 1) {
          sys.repair = 0;
          sys.damage--;
          this.gainXp(c, "repair");
        }
        c.task = "repair";
      } else if (!drone && sys && sys.station === c.tile && MANNABLE.includes(sys.id)) c.task = "man";
      else if (!drone && medbay && medbay.room === room && c.hp < c.maxHp) c.task = "heal";
      else c.task = "idle";
    }
    // FTL: partial repair is lost once the last of the ship's own crew leaves the room; while they're
    // still in it (fighting intruders, fighting fire) it only pauses.
    for (const sys of Object.values(ship.systems)) {
      if (!sys || sys.repair <= 0) continue;
      const present = ship.crew.some((q) => q.owner === ship.idx && !q.dead && q.dying === undefined && !q.mind && g.tiles.get(q.tile)?.room === sys.room && !(q.path.length && g.tiles.get(q.path[q.path.length - 1])?.room !== sys.room));
      if (!present) sys.repair = 0;
    }
    for (const [c, dest, tile] of moving) {
      this.moveAboard(c, ship, dest, tile);
      // Reconstructive Teleport heals on arrival.
      if (augCount(st.ships[c.owner], "TELEPORT_HEAL")) c.hp = c.maxHp;
      c.beam = { t: RULES.teleportTime, phase: "in", ship: dest.idx, tile };
    }
    for (const c of leaving) {
      ship.crew = ship.crew.filter((q) => q !== c);
      if (c.drone !== undefined) this.loseDrone(st.ships[c.owner], c.drone);
      else {
        // The body goes home: give it a tile on its own ship (its old one belongs to this ship's layout).
        const home = st.ships[c.owner];
        const hg = this.geo(home);
        const tile = (home.systems.clonebay && hg.roomTiles.get(home.systems.clonebay.room)?.[0]) || [...hg.tiles.keys()][0];
        const [x, y] = unkey(tile);
        Object.assign(c, { tile, home: tile, x, y, path: [] });
        home.crew.push(c);
      }
    }
  }

  /** Drone unit AI: anti-personnel hunts intruders, repair drones go to damaged systems, boarders to systems. */
  private unitThink(ship: ShipState, g: Geometry, c: CrewState, room: number): void {
    const race = c.race;
    let target = -1;
    const droneRoom = ship.systems.drones?.room;
    if (c.owner === ship.idx && droneRoom !== undefined && c.hp < c.maxHp * 0.4) {
      // Badly hurt interior drones go home to the drone room to repair themselves.
      target = droneRoom;
    } else if (race === "battle") {
      const intruder = ship.crew.find((q) => q.owner !== c.owner && !q.dead && q.dying === undefined);
      if (intruder) target = g.tiles.get(intruder.tile)!.room;
    } else if (race === "repair") {
      const broken = Object.values(ship.systems).find((s) => s && s.damage > 0 && s.room !== room);
      const here = Object.values(ship.systems).find((s) => s && s.room === room && s.damage > 0);
      if (broken && !here) target = broken.room;
    } else {
      const here = Object.values(ship.systems).find((s) => s && s.room === room);
      const done = !here || (raceOf(race).ionBoarder ? here.ion >= here.level : here.damage >= here.level);
      if (done) {
        const options = Object.values(ship.systems).filter((s) => s && s.level > 0 && s.damage < s.level && s.room !== room);
        if (options.length) target = this.rng.pick(options)!.room;
      }
    }
    if (target >= 0 && target !== room) this.sendCrew(ship, g, c, target);
  }

  // ---------------------------------------------------------------- boarding

  // ---------------------------------------------------------------- battery, mind control, artillery

  /** Reactor bars available now: the reactor plus the battery (a hacked battery takes two away). */
  cap(ship: ShipState): number {
    return Math.max(0, ship.reactor + (ship.reactorBonus ?? 0));
  }

  private startBattery(ship: ShipState): boolean {
    const b = ship.systems.battery;
    if (!b || this.eff(b) <= 0 || (ship.battery?.t ?? 0) > 0 || (ship.battery?.cd ?? 0) > 0) return false;
    ship.battery = { t: RULES.batteryDuration, cd: 0 };
    this.state.events.push({ e: "battery", ship: ship.idx, on: true });
    return true;
  }

  private batteryTick(ship: ShipState): void {
    const b = ship.systems.battery;
    const bat = ship.battery;
    if (bat) {
      if (bat.t > 0) {
        bat.t -= DT;
        if (bat.t <= 0 || this.eff(b) <= 0) {
          bat.t = 0;
          bat.cd = RULES.batteryCooldown * (augCount(ship, "BATTERY_BOOSTER") ? 1 - (this.db.augments?.BATTERY_BOOSTER?.value ?? 0.5) : 1);
          this.state.events.push({ e: "battery", ship: ship.idx, on: false });
        }
      } else if (bat.cd > 0) bat.cd = Math.max(0, bat.cd - DT);
    }
    const lv = Math.min(2, this.eff(b));
    ship.reactorBonus = ((bat?.t ?? 0) > 0 ? RULES.batteryPower[lv] : 0) - (b?.hacked ? 2 : 0);
    // Over the cap (battery ran out, a hack): power comes off the least vital systems first.
    const order: SystemId[] = ["drones", "artillery4", "artillery3", "artillery2", "artillery", "mind", "hacking", "cloaking", "teleporter", "weapons", "clonebay", "medbay", "oxygen", "engines", "shields"];
    for (const id of order) {
      const s = ship.systems[id];
      while (s && s.power > 0 && reactorUsed(ship) > this.cap(ship)) s.power--;
      if (id === "weapons") this.clampWeapons(ship);
    }
  }

  /** Mind control one hostile crew member standing in a room (on the enemy ship, or an intruder at home). */
  private mindControl(ship: ShipState, room: number, onEnemy: boolean): boolean {
    const ms = ship.systems.mind;
    const lv = Math.min(3, this.eff(ms));
    if (!ms || lv <= 0 || (ship.mindCd ?? 0) > 0) return false;
    // One at a time: the recharge starts once control ends.
    if (this.state.ships.some((s) => s.crew.some((c) => c.mind?.by === ship.idx))) return false;
    const T = this.state.ships[onEnemy ? 1 - ship.idx : ship.idx];
    if (onEnemy && (T.superShield ?? 0) > 0 && !augCount(ship, "ZOLTAN_BYPASS")) return false;
    const g = this.geo(T);
    const target = T.crew
      .filter((c) => c.owner !== ship.idx && !c.dead && c.dying === undefined && c.drone === undefined && !c.mind && g.tiles.get(c.tile)?.room === room)
      .sort((a, b) => b.hp - a.hp)[0];
    if (!target) return false;
    const boost = RULES.mindBoost[lv];
    target.mind = { by: ship.idx, t: RULES.mindDuration[lv], owner: target.owner, boost, maxHp: target.maxHp };
    target.owner = ship.idx;
    target.path = [];
    target.maxHp = Math.round(target.maxHp * (1 + boost));
    target.hp = Math.min(target.maxHp, target.hp * (1 + boost));
    this.state.events.push({ e: "mind", ship: ship.idx, crew: target.id, on: true });
    return true;
  }

  private release(c: CrewState): void {
    const m = c.mind!;
    c.owner = m.owner;
    c.maxHp = m.maxHp;
    c.hp = Math.min(c.hp, c.maxHp);
    c.mind = undefined;
    c.path = [];
    this.state.ships[m.by].mindCd = RULES.mindCooldown;
    this.state.events.push({ e: "mind", ship: m.by, crew: c.id, on: false });
  }

  /** Control wears off over time, or at once if the controller's mind system goes down. */
  private mindTick(ship: ShipState): void {
    if ((ship.mindCd ?? 0) > 0) ship.mindCd = Math.max(0, ship.mindCd! - DT);
    const up = this.eff(ship.systems.mind) > 0;
    for (const s of this.state.ships)
      for (const c of s.crew) {
        if (!c.mind || c.mind.by !== ship.idx || c.dead) continue;
        c.mind.t -= DT;
        if (c.mind.t <= 0 || !up) this.release(c);
      }
  }

  /** Artillery fires its weapon by itself when charged: at the chosen room, or a random one. */
  private artilleryTick(ship: ShipState): void {
    const enemy = this.state.ships[1 - ship.idx];
    for (const id of ARTILLERY_IDS) {
      const s = ship.systems[id];
      if (!s?.weapon) continue;
      const bp = this.wbp(s.weapon);
      const lv = Math.min(4, this.eff(s));
      if (!bp || lv <= 0) {
        s.charge = Math.max(0, (s.charge ?? 0) - DT * RULES.weaponDrain);
        continue;
      }
      // A cloaked target halts charging, as for weapons.
      if ((enemy.cloak?.t ?? 0) > 0) continue;
      // The Federation artillery charges faster with more power; the flagship's guns use their listed cooldowns.
      const cd = bp.cooldown * (bp.id.startsWith("ARTILLERY_FED") ? RULES.artilleryCharge[lv] : 1);
      s.charge = Math.min(cd, (s.charge ?? 0) + DT);
      if (s.charge < cd || ship.missiles < bp.missiles) continue;
      const room = ship.artilleryTarget ?? this.rng.pick(enemy.rooms).id;
      let target: WeaponTarget = { kind: "room", room };
      if (bp.type === "BEAM") {
        const c = roomCentre(this.geo(enemy), room);
        const a = this.rng.next() * Math.PI * 2;
        const half = Math.min(bp.length || 140, 220) / 2;
        target = { kind: "beam", x1: c.x - Math.cos(a) * half, y1: c.y - Math.sin(a) * half, x2: c.x + Math.cos(a) * half, y2: c.y + Math.sin(a) * half };
      }
      ship.missiles -= bp.missiles;
      this.launch(ship, bp, target, 1, -2 - ARTILLERY_IDS.indexOf(id), 0);
      s.charge = 0;
    }
  }

  // ---------------------------------------------------------------- cloaking and hacking

  private startCloak(ship: ShipState): boolean {
    const cs = ship.systems.cloaking;
    const lv = Math.min(3, this.eff(cs));
    if (!cs || lv <= 0 || (ship.cloak?.t ?? 0) > 0 || (ship.cloak?.cd ?? 0) > 0) return false;
    ship.cloak = { t: RULES.cloakDuration[lv], cd: 0 };
    this.state.events.push({ e: "cloak", ship: ship.idx, on: true });
    return true;
  }

  private cloakTick(ship: ShipState): void {
    const c = ship.cloak;
    if (!c) return;
    if (c.t > 0) {
      c.t -= DT;
      // Losing the system (damage, ion, a hack) drops the cloak early.
      if (this.eff(ship.systems.cloaking) <= 0) c.t = 0;
      if (c.t <= 0) {
        c.t = 0;
        c.cd = RULES.cloakCooldown;
        this.state.events.push({ e: "cloak", ship: ship.idx, on: false });
      }
    } else if (c.cd > 0 && this.eff(ship.systems.cloaking) > 0) c.cd = Math.max(0, c.cd - DT);
  }

  private hackLaunch(ship: ShipState, room: number): boolean {
    const st = this.state;
    const T = st.ships[1 - ship.idx];
    const hs = ship.systems.hacking;
    if (!hs || this.eff(hs) <= 0 || ship.hack || (ship.droneParts ?? 0) <= 0) return false;
    if (!this.geo(T).roomTiles.has(room) || (T.superShield ?? 0) > 0) return false;
    ship.droneParts = (ship.droneParts ?? 0) - 1;
    ship.hack = { room, attached: false, pulse: 0, cd: 0 };
    const [tx, ty] = unkey(this.geo(T).roomTiles.get(room)![0]);
    st.projectiles.push({
      id: st.nextId++, from: ship.idx, weapon: "DRONE_HACKING", slot: -1, kind: "HACK", delay: 0, t: 0, flight: RULES.hackFlight,
      target: { kind: "room", room }, px: (tx + 0.5) * TILE, py: (ty + 0.5) * TILE, damageBonus: 0,
    });
    return true;
  }

  private landHack(src: ShipState, T: ShipState, p: Projectile): void {
    if (!src.hack || p.target.kind !== "room") return;
    if ((T.superShield ?? 0) > 0) {
      src.hack = undefined;
      return;
    }
    src.hack.attached = true;
    src.hack.cd = 1;
    this.state.events.push({ e: "hackLand", ship: src.idx, room: p.target.room });
  }

  private startPulse(ship: ShipState): boolean {
    const h = ship.hack;
    const lv = Math.min(3, this.eff(ship.systems.hacking));
    if (!h?.attached || lv <= 0 || h.pulse > 0 || h.cd > 0) return false;
    const st = this.state;
    const T = st.ships[1 - ship.idx];
    h.pulse = RULES.hackPulse[lv];
    const sys = Object.values(T.systems).find((s) => s && s.room === h.room);
    // One-off effects as the pulse starts.
    if (sys?.id === "teleporter") {
      // Take over their teleporter: their boarders on this ship are sent home.
      const g = this.geo(T);
      for (const c of ship.crew.filter((q) => q.owner === T.idx && !q.dead && q.dying === undefined && q.drone === undefined)) {
        const taken = new Set(T.crew.filter((q) => q.owner === T.idx && !q.dead).map((q) => q.tile));
        const tile = (g.roomTiles.get(sys.room) ?? []).find((t) => !taken.has(t)) ?? [...g.tiles.keys()].find((t) => !taken.has(t));
        if (tile) this.moveAboard(c, ship, T, tile);
      }
    } else if (sys?.id === "drones") {
      for (const d of T.drones ?? []) if (d.deployed && this.rng.chance(RULES.hackDroneKill)) this.loseDrone(T, d.slot);
    } else if (sys?.id === "clonebay") {
      for (const c of this.crewOf(T.idx)) if (c.dead) c.clone = undefined;
    } else if (sys?.id === "hacking" && T.hack) {
      T.hack.pulse = 0;
    } else if (sys?.id === "doors") {
      T.doors = T.doors.map(() => false);
    }
    // Hacking Stun: everyone in the hacked room is stunned for the pulse.
    if (augCount(ship, "HACKING_STUN")) {
      const g = this.geo(T);
      for (const c of T.crew) if (!c.dead && g.tiles.get(c.tile)?.room === h.room) c.stun = Math.max(c.stun, h.pulse);
    }
    st.events.push({ e: "hackPulse", ship: ship.idx, room: h.room });
    return true;
  }

  /** The hacking drone locks the system in its room; a pulse switches that system's hack effect on. */
  private hackTick(ship: ShipState): void {
    const h = ship.hack;
    if (!h?.attached) return;
    const T = this.state.ships[1 - ship.idx];
    const sys = Object.values(T.systems).find((s) => s && s.room === h.room);
    const powered = this.eff(ship.systems.hacking) > 0;
    if (h.pulse > 0) {
      h.pulse -= DT;
      if (!powered) h.pulse = 0;
      if (h.pulse <= 0) {
        h.pulse = 0;
        h.cd = RULES.hackCooldown;
      }
    } else if (h.cd > 0 && powered) h.cd = Math.max(0, h.cd - DT);
    if (powered) {
      // A powered hacking drone locks the room's doors shut, whatever the pulse is doing.
      T.lockedRoom = h.room;
      T.doors = T.doors.map((o, i) => (this.doorLocked(T, i) ? false : o));
    }
    if (sys && powered) {
      sys.locked = true;
      if (h.pulse > 0) sys.hacked = true;
    }
  }

  /** Every crew member a player owns, aboard either ship (drone units excluded). */
  crewOf(idx: 0 | 1): CrewState[] {
    return this.state.ships.flatMap((s) => s.crew.filter((c) => (c.mind?.owner ?? c.owner) === idx && c.drone === undefined));
  }

  private teleTick(ship: ShipState): void {
    const t = ship.systems.teleporter;
    if (!t) return;
    const lv = Math.min(3, this.eff(t));
    // Losing power drains the charge, as in FTL.
    ship.tele = lv > 0 ? Math.min(RULES.teleCooldown[lv], (ship.tele ?? 0) + DT) : 0;
  }

  teleReady(ship: ShipState): boolean {
    const t = ship.systems.teleporter;
    const lv = Math.min(3, this.eff(t));
    return !!t && lv > 0 && (ship.tele ?? 0) >= RULES.teleCooldown[lv];
  }

  private moveAboard(c: CrewState, from: ShipState, to: ShipState, tile: string): void {
    from.crew = from.crew.filter((q) => q !== c);
    const [x, y] = unkey(tile);
    Object.assign(c, { tile, home: tile, x, y, path: [], task: "idle", bash: 0 });
    to.crew.push(c);
  }

  /** Send crew standing in the teleporter room to an enemy room, or bring own crew back from one. */
  private teleport(ship: ShipState, room: number, out: boolean): boolean {
    const st = this.state;
    const enemy = st.ships[1 - ship.idx];
    const ts = ship.systems.teleporter;
    const g = this.geo(ship);
    const eg = this.geo(enemy);
    if (!ts || !this.teleReady(ship) || !eg.roomTiles.has(room)) return false;
    // A Zoltan super shield blocks teleporting (FTL's "super shields prevent teleporting"), unless bypassed.
    if ((enemy.superShield ?? 0) > 0 && !augCount(ship, "ZOLTAN_BYPASS")) return false;
    const held = (s: ShipState) => new Set(s.crew.filter((q) => q.owner === ship.idx && !q.dead).flatMap((q) => [q.tile, q.home]));
    let moved: CrewState[] = [];
    if (out) {
      const going = ship.crew
        .filter((c) => c.owner === ship.idx && c.drone === undefined && !c.dead && c.dying === undefined && !c.beam && c.path.length === 0 && g.tiles.get(c.tile)?.room === ts.room)
        .slice(0, RULES.teleMax);
      const taken = held(enemy);
      const free = eg.roomTiles.get(room)!.filter((t) => !taken.has(t));
      moved = going.slice(0, free.length);
      moved.forEach((c, i) => (c.beam = { t: RULES.teleportTime, phase: "out", ship: enemy.idx, tile: free[i] }));
    } else {
      const coming = enemy.crew.filter((c) => c.owner === ship.idx && c.drone === undefined && !c.dead && c.dying === undefined && !c.beam && eg.tiles.get(c.tile)?.room === room);
      const taken = held(ship);
      const pad = g.roomTiles.get(ts.room)!.filter((t) => !taken.has(t));
      const rest = [...g.tiles.keys()].filter((t) => !taken.has(t) && !pad.includes(t));
      const free = [...pad, ...rest];
      moved = coming.slice(0, free.length);
      moved.forEach((c, i) => (c.beam = { t: RULES.teleportTime, phase: "out", ship: ship.idx, tile: free[i] }));
    }
    if (!moved.length) return false;
    ship.tele = 0;
    st.events.push({ e: "teleport", ship: ship.idx, crew: moved.map((c) => c.id), out, room });
    return true;
  }

  /** Interior drones step out of the drone room; boarding drones fly over (and can be shot down). */
  private launchUnit(ship: ShipState, enemy: ShipState, d: DroneState, bpId: string, type: string): boolean {
    const st = this.state;
    if (type === "BOARDER") {
      if ((enemy.superShield ?? 0) > 0) return false;
      const eg = this.geo(enemy);
      // It picks a random room to punch into, system or not (FTL's boarding drone).
      const room = this.rng.pick(enemy.rooms).id;
      const [tx, ty] = unkey(eg.roomTiles.get(room)![0]);
      st.projectiles.push({
        id: st.nextId++, boarder: d.slot, from: ship.idx, weapon: bpId, slot: -1, kind: "BOARDER", delay: 0, t: 0,
        flight: RULES.boarderFlight, target: { kind: "room", room }, px: (tx + 0.5) * TILE, py: (ty + 0.5) * TILE, damageBonus: 0,
      });
      return true;
    }
    const room = ship.systems.drones?.room ?? ship.rooms[0].id;
    return !!this.spawnUnit(ship, ship, d.slot, type === "BATTLE" ? "battle" : "repair", room);
  }

  private spawnUnit(owner: ShipState, aboard: ShipState, slot: number, race: string, room: number): CrewState | null {
    const g = this.geo(aboard);
    const taken = new Set(aboard.crew.filter((q) => q.owner === owner.idx && !q.dead).map((q) => q.tile));
    const tile = (g.roomTiles.get(room) ?? []).find((t) => !taken.has(t)) ?? [...g.tiles.keys()].find((t) => !taken.has(t));
    if (!tile) return null;
    const [x, y] = unkey(tile);
    const t = raceOf(race);
    const c: CrewState = {
      id: 100000 + this.state.nextId++, name: "", race, hp: t.hp, maxHp: t.hp, x, y, tile, path: [], home: tile, task: "idle",
      xp: Object.fromEntries(Object.keys(RULES.skillXp).map((k) => [k, 0])) as CrewState["xp"], stun: 0, dead: false, owner: owner.idx, drone: slot,
    };
    aboard.crew.push(c);
    return c;
  }

  /** A boarding drone lands: it punches a breach into the room and starts wrecking systems. */
  private landBoarder(src: ShipState, T: ShipState, p: Projectile): void {
    const d = p.boarder !== undefined ? src.drones?.[p.boarder] : undefined;
    if (!d || !d.powered || p.target.kind !== "room") return;
    if ((T.superShield ?? 0) > 0) return this.loseDrone(src, d.slot);
    const room = p.target.room;
    const rs = T.rooms.find((r) => r.id === room)!;
    const tiles = this.geo(T).roomTiles.get(room)!;
    if (!Object.keys(rs.breaches).length) {
      rs.breaches[this.rng.pick(tiles)] = 100;
      this.state.events.push({ e: "breach", ship: T.idx, room });
    }
    if (!this.spawnUnit(src, T, d.slot, p.weapon === "BOARDER_ION" ? "boarder_ion" : "boarder", room)) this.loseDrone(src, d.slot);
  }

  /** Remove a drone unit (its drone was unpowered or lost). */
  private removeUnit(owner: 0 | 1, slot: number): void {
    for (const s of this.state.ships) s.crew = s.crew.filter((c) => !(c.owner === owner && c.drone === slot));
    this.state.projectiles = this.state.projectiles.filter((p) => !(p.from === owner && p.boarder === slot));
  }

  /** A deployed drone was destroyed: it loses power and has to be rebuilt before the player can power it again. */
  private loseDrone(ship: ShipState, slot: number, rebuild = true): void {
    const d = ship.drones?.[slot];
    if (!d) return;
    if (d.deployed && rebuild) this.state.events.push({ e: "droneLost", ship: ship.idx, drone: slot });
    const bp = this.db.droneBPs?.[d.bp];
    if (d.powered && ship.systems.drones) ship.systems.drones.power = Math.max(0, ship.systems.drones.power - (bp?.power ?? 1));
    d.powered = false;
    d.deployed = false;
    d.launch = 0;
    if (rebuild) d.rebuild = RULES.droneRebuild;
    this.removeUnit(ship.idx, slot);
  }

  /**
   * As in FTL: when a station is left empty (its crew member walked off or died), an idle crew member
   * standing in the same room steps onto it.
   */
  private refillStations(ship: ShipState, g: Geometry): void {
    const alive = ship.crew.filter((c) => !c.dead && c.dying === undefined && c.owner === ship.idx && c.drone === undefined && !c.mind);
    for (const sys of Object.values(ship.systems)) {
      if (!sys?.station || !MANNABLE.includes(sys.id)) continue;
      if (alive.some((c) => c.home === sys.station || c.tile === sys.station)) continue;
      const sub = alive.find((c) => c.path.length === 0 && c.stun <= 0 && c.task === "idle" && g.tiles.get(c.tile)?.room === sys.room);
      if (!sub) continue;
      const p = findPath(g, sub.tile, sys.station);
      if (!p) continue;
      sub.home = sys.station;
      sub.path = p;
    }
  }

  private respawn(ship: ShipState, g: Geometry, c: CrewState, room: number): void {
    const taken = new Set(ship.crew.filter((q) => !q.dead && q !== c && q.owner === c.owner).map((q) => q.tile));
    const tiles = g.roomTiles.get(room) ?? [];
    const tile = tiles.find((t) => !taken.has(t)) ?? tiles[0];
    const [x, y] = unkey(tile);
    Object.assign(c, { dead: false, clone: undefined, dying: undefined, hp: c.maxHp, tile, home: tile, x, y, path: [], task: "idle", stun: 0 });
    this.state.events.push({ e: "clone", ship: ship.idx, crew: c.id });
  }

  // ---------------------------------------------------------------- fire, breaches, oxygen

  private environmentTick(ship: ShipState): void {
    const g = this.geo(ship);
    const ox = this.eff(ship.systems.oxygen);
    const o2Hacked = !!ship.systems.oxygen?.hacked;
    const byId = new Map(ship.rooms.map((r) => [r.id, r]));
    for (const rs of ship.rooms) {
      const tiles = g.roomTiles.get(rs.id)!;
      if (o2Hacked) rs.o2 -= RULES.hackO2Drain * DT;
      if (ox > 0) rs.o2 += RULES.o2Refill[Math.min(3, ox)] * DT;
      else rs.o2 -= RULES.o2Drain * DT;
      const nb = Object.keys(rs.breaches).length;
      if (nb) rs.o2 -= RULES.breachDrain * nb * (4 / tiles.length) * DT;
      const fireTiles = Object.keys(rs.fires);
      // Fire Suppression puts fires out on its own; Slug Repair Gel seals breaches.
      if (augCount(ship, "FIRE_EXTINGUISHERS"))
        for (const t of fireTiles) if ((rs.fires[t] -= RULES.fireSuppression * DT) <= 0) delete rs.fires[t];
      if (augCount(ship, "SLUG_GEL"))
        for (const t of Object.keys(rs.breaches)) if ((rs.breaches[t] -= RULES.slugGel * DT) <= 0) delete rs.breaches[t];
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
          // Fire crosses doors too; a closed door halves the chance.
          const opts = g.adj.get(t) ?? [];
          const e = opts.length ? this.rng.pick(opts) : null;
          // Crossing a door: halved when it's closed, and less likely with every door level (super doors at 4).
          const dl = Math.min(4, this.eff(ship.systems.doors));
          const doorK = e && e.door >= 0 ? (this.doorOpen(ship, e.door) ? 1 : RULES.fireDoorClosed) * Math.max(0.05, 1 - RULES.fireDoorPerLevel * dl) : 1;
          if (e && this.rng.chance(doorK)) {
            const to = e.to;
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
      if (sys && burning && !this.god.has(ship.idx)) {
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
    // Open airlocks pull air out of every room joined to them through open doors, weaker with distance
    // (air rushes out; it doesn't diffuse room by room).
    const depth = new Map<number, number>();
    const q: number[] = [];
    g.doors.forEach((d, i) => {
      if (!this.doorOpen(ship, i) || (d.roomA >= 0 && d.roomB >= 0)) return;
      const r = d.roomA >= 0 ? d.roomA : d.roomB;
      if (!depth.has(r)) {
        depth.set(r, 0);
        q.push(r);
      }
    });
    while (q.length) {
      const r = q.shift()!;
      g.doors.forEach((d, i) => {
        if (!this.doorOpen(ship, i) || d.roomA < 0 || d.roomB < 0) return;
        const o = d.roomA === r ? d.roomB : d.roomB === r ? d.roomA : -1;
        if (o >= 0 && !depth.has(o)) {
          depth.set(o, depth.get(r)! + 1);
          q.push(o);
        }
      });
    }
    for (const [r, dd] of depth) if (dd > 0) byId.get(r)!.o2 -= (RULES.ventPull / (1 + 0.5 * (dd - 1))) * DT;
    // Doors: open interior doors share O2 gradually, open airlocks vent to space.
    g.doors.forEach((d, i) => {
      if (!this.doorOpen(ship, i)) return;
      const a = d.roomA >= 0 ? byId.get(d.roomA) : undefined;
      const b = d.roomB >= 0 ? byId.get(d.roomB) : undefined;
      if (a && b) {
        const f = (a.o2 - b.o2) * Math.min(0.5, RULES.doorFlow * DT * 0.5);
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
      if (!this.crewOf(s.idx).some((c) => !c.dead)) return "crew lost";
      return "";
    });
    if (lost[0] || lost[1]) {
      st.winner = lost[0] && lost[1] ? -1 : lost[0] ? 1 : 0;
      st.endReason = lost[0] && lost[1] ? `both: ${lost[0]} / ${lost[1]}` : (lost[0] || lost[1]);
    } else if (st.config.timeLimit > 0 && st.tick >= st.config.timeLimit * TICK_HZ) {
      const score = (s: ShipState) =>
        st.config.winCondition === "crew" ? this.crewOf(s.idx).filter((c) => !c.dead).length : s.hull / s.maxHull;
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
