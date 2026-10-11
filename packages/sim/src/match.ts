/**
 * The authoritative simulation. Pure: no clocks, no I/O. `step()` advances one tick (1/30 s); commands are
 * applied at the start of the tick they're queued for. Same seed + same commands = same state.
 */
import { ARTILLERY_IDS, SPACE_DRONES, UNIT_DRONES, type GameDB, type SystemId, type WeaponBP } from "@ftl/data";
import type { Command } from "./commands.ts";
import { findPath, geometry, key, roomAt, roomCentre, unkey, type Geometry } from "./geometry.ts";
import { augCount, autoPower, blockedTiles, buildShip, isSubsystem, reactorUsed, usable, type Loadout } from "./loadout.ts";
import { Rng } from "./rng.ts";
import { DT, raceOf, RACES, RULES, SKILLS, TICK_HZ, TILE, type SkillId } from "./rules.ts";
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
    // The hazards' own "weapons": an asteroid (1 damage, a little fire and breach) and the ASB's shot
    // (3 damage through any shields, always a breach).
    const hz = (id: string, title: string, damage: number, sp: number, fireChance: number, breachChance: number) => ({
      id, title, type: "LASER" as const, damage, shots: 1, sp, fireChance, breachChance, stunChance: 0, ion: 0, sysDamage: 0, persDamage: 0,
      hullBust: false, cooldown: 1, power: 0, cost: 0, missiles: 0, length: 0, radius: 0, speed: 0, stun: 0, image: "", weaponArt: "", rarity: 0, chargeLevels: 1,
    });
    db.weapons.__ASTEROID ??= hz("__ASTEROID", "Asteroid", 1, 0, 1, 1);
    db.weapons.__ASB ??= hz("__ASB", "Anti-ship battery", 3, 10, 0, 10);
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
    // Survival: boarders who outlasted the last fight are still aboard, now fighting for this enemy.
    ships.forEach((s, i) => {
      const g = this.geo(s);
      (loadouts[i].boarders ?? []).forEach((b, k) => {
        const tile = g.tiles.has(b.tile) ? b.tile : [...g.tiles.keys()][0];
        const [x, y] = tile.split(",").map(Number);
        const t = raceOf(b.race);
        s.crew.push({
          id: 500 + i * 50 + k, name: b.name, race: RACES[b.race] ? b.race : "human", hp: Math.max(1, Math.min(t.hp, b.hp)), maxHp: t.hp,
          x, y, tile, path: [], home: tile, task: "idle",
          xp: Object.fromEntries(SKILLS.map((sk) => [sk, Math.max(0, Math.round(Number(b.xp?.[sk]) || 0))])) as CrewState["xp"],
          stun: 0, dead: false, owner: (1 - i) as 0 | 1, stranded: true,
        });
      });
    });
    if (config.pause === "clock") {
      const bank = (config.pauseBank ?? RULES.pauseBank) > 0 ? (config.pauseBank ?? RULES.pauseBank) : -1;
      this.state.pauseBank = [bank, bank];
    }
    if (config.pause === "tactical") this.state.nextTactical = Math.round((config.tacticalEvery ?? RULES.tacticalEvery) * TICK_HZ);
    const hk = config.hazard === "random" ? this.rng.pick(["sun", "pulsar", "asteroids", "nebula", "storm"] as const) : config.hazard ?? "none";
    if (hk !== "none") {
      this.state.hazard = { kind: hk, next: this.hazardDelay(hk), warned: false, asbTarget: this.rng.int(2) as 0 | 1 };
      if (hk === "asteroids") this.state.hazard.rocks = [0, 1].map(() => ({ phase: 0 as const, left: 5 + this.rng.next() * 5, spawn: 0 }));
    }
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
    // Paused: orders still go in (crew get their paths, power moves, targets are set) but no time passes.
    if (this.pauseStep()) {
      st.rng = this.rng.s;
      return;
    }
    this.hazardTick();
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
    for (const s of order) this.restorePower(s);
    for (const s of order) this.updateDerived(s);
    st.tick++;
    this.checkEnd();
    st.rng = this.rng.s;
  }

  /** How much punishment a system's bars take: 1, or for a reinforced one 10% more per bar it has. */
  toughness(s: SystemState): number {
    return s.reinforced ? 1 + RULES.reinforcePerBar * s.level : 1;
  }

  /** `n` points of system damage; a reinforced system soaks some, carrying the rest toward the next bar. */
  private hurtSystem(s: SystemState, n: number): void {
    const t = this.toughness(s);
    let bars = n;
    if (t > 1) {
      s.armour = (s.armour ?? 0) + n / t;
      bars = Math.floor(s.armour + 1e-9);
      s.armour -= bars;
    }
    if (bars <= 0) return;
    s.damage = Math.min(s.level, s.damage + bars);
    s.repair = 0;
  }

  /**
   * Survival's aftermath: the enemy is gone, but the winner's own ship carries on for a while (crew repair,
   * fight fires and boarders, seal breaches, heal, air flows). Nothing fires and nothing reaches the wreck.
   * Orders and the pause still work. Returns true while paused.
   */
  aftermathStep(idx: 0 | 1): boolean {
    const st = this.state;
    st.events = [];
    const outward = new Set(["target", "teleport", "retrieve", "hackLaunch", "hackPulse", "mind", "artilleryTarget", "cloak", "autofire"]);
    for (const { player, cmd } of this.queue.splice(0)) if (player === idx && !outward.has(cmd.c)) this.apply(st.ships[idx], cmd);
    if (this.pauseStep()) {
      st.rng = this.rng.s;
      return true;
    }
    const s = st.ships[idx];
    for (const x of Object.values(s.systems)) if (x) x.locked = x.hacked = false;
    s.lockedRoom = undefined;
    s.doorPass = (s.doorPass ?? s.doors.map(() => 0)).map((t) => Math.max(0, t - DT));
    this.systemsTick(s);
    this.crewTick(s);
    this.environmentTick(s);
    this.restorePower(s);
    this.updateDerived(s);
    // Shots already in the air fly on: the beaten ship's last volleys can still land on us; ours carry on
    // to where the wreck was and fizzle out.
    const keep: Projectile[] = [];
    for (const p of st.projectiles) {
      if (p.delay > 0) {
        p.delay -= DT;
        keep.push(p);
        continue;
      }
      p.t += DT;
      if (p.t < p.flight) keep.push(p);
      else if (p.from !== idx) this.resolve(p);
    }
    st.projectiles = keep;
    st.tick++;
    st.rng = this.rng.s;
    return false;
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
          // Taking power off a system that's down to nothing cancels a bar it would get back when repaired.
          if (s.power <= 0) {
            if ((s.want ?? 0) <= 0) return false;
            s.want = (s.want ?? 0) - 1;
            return true;
          }
          s.power--;
          if (s.id === "weapons") {
            this.clampWeapons(ship);
            for (const w of ship.weapons) if (!w.powered) w.want = false;
          }
          if (s.id === "drones") {
            this.clampDrones(ship);
            for (const d of ship.drones ?? []) if (!d.powered) d.want = false;
          }
        }
        s.want = s.power;
        return true;
      }
      case "weaponPower": {
        const w = ship.weapons[cmd.slot];
        const ws = ship.systems.weapons;
        if (!w || !ws || ws.ion > 0 || ws.locked) return false;
        if (!cmd.on) {
          if (!w.powered) return false;
          w.powered = false;
          w.want = false;
          ws.power = Math.max(0, ws.power - this.wbp(w.bp).power);
          return true;
        }
        if (w.powered) return false;
        // No missiles, no powering a weapon that fires them.
        if (this.wbp(w.bp).missiles > ship.missiles) return false;
        const need = this.weaponLoad(ship) + this.wbp(w.bp).power;
        if (need > usable(ws)) return false;
        const extra = need - ws.power - (ws.bonus ?? 0);
        if (extra > 0) {
          if (reactorUsed(ship) + extra > this.cap(ship)) return false;
          ws.power += extra;
        }
        w.powered = true;
        w.want = true;
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
      case "pause":
        return this.pauseCmd(ship.idx, cmd.on);
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
          // A deployed drone that loses power goes offline (it stays out there, idle) until it's powered again.
          if (!d.powered) return false;
          d.powered = false;
          d.want = false;
          d.launch = 0;
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
        d.want = true;
        // A new drone launches after a moment (using a drone part); an offline one just comes back on. A Shield
        // Overcharger's timer starts over when it gets power back (wiki).
        d.launch = d.deployed ? 0 : RULES.droneLaunch;
        if (d.deployed && bp.type === "SHIELD") d.cd = RULES.shieldDroneTimes[Math.min(4, ship.superShield ?? 0)];
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
    for (const t of blockedTiles(ship)) claimed.add(t);
    const sys = Object.values(ship.systems).find((s) => s && s.room === room && s.station);
    let dest = "";
    if (sys && !claimed.has(sys.station)) dest = sys.station;
    if (!dest) dest = tiles.find((t) => !claimed.has(t)) ?? "";
    if (!dest) return; // room full
    // Mid-step between tiles they finish the step first; but someone breaking down a closed door drops it
    // and replans from where they stand (the new way may lead through a different door).
    const edge0 = c.path.length ? g.adj.get(c.tile)?.find((e) => e.to === c.path[0]) : undefined;
    const atDoor = !!edge0 && edge0.door >= 0 && !this.doorOpen(ship, edge0.door) && c.x === unkey(c.tile)[0] && c.y === unkey(c.tile)[1];
    if (atDoor) {
      c.path = [];
      c.bash = 0;
      c.task = "idle";
    }
    const from = c.path.length ? c.path[0] : c.tile;
    let p = findPath(g, from, dest);
    // Intruders join a siege: if a comrade is already shooting down a door into that room, go in that way.
    if (c.owner !== ship.idx) {
      const siege = ship.crew.find((q) => {
        if (q === c || q.owner !== c.owner || q.dead || q.task !== "fight" || !q.path.length) return false;
        const e = g.adj.get(q.tile)?.find((x) => x.to === q.path[0]);
        const d = e && e.door >= 0 ? g.doors[e.door] : undefined;
        return !!d && (d.roomA === room || d.roomB === room) && !this.doorOpen(ship, e!.door);
      });
      if (siege) {
        const toDoor = findPath(g, from, siege.tile);
        const through = findPath(g, siege.tile, dest);
        if (toDoor && through && through.length && g.adj.get(siege.tile)?.some((x) => x.to === through[0] && x.door >= 0)) p = [...toDoor, ...through];
      }
    }
    if (!p) return;
    c.home = dest;
    c.path = c.path.length ? [c.path[0], ...p] : p;
  }

  // ---------------------------------------------------------------- pausing (experimental)

  get paused(): boolean {
    return !!this.state.pause;
  }

  /** Pause clock: start a pause from your own bank, or end your own. In a tactical timeout, `off` means ready. */
  private pauseCmd(idx: 0 | 1, on: boolean): boolean {
    const st = this.state;
    const p = st.pause;
    if (p?.kind === "tactical") {
      if (on) return false;
      p.ready ??= [false, false];
      p.ready[idx] = true;
      if (p.ready[0] && p.ready[1]) this.endPause();
      return true;
    }
    if (st.config.pause !== "clock" || !st.pauseBank) return false;
    if (on) {
      if (p || st.pauseBank[idx] === 0) return false;
      st.pause = { kind: "player", by: idx, left: st.pauseBank[idx] };
      st.events.push({ e: "pause", on: true, kind: "player", by: idx });
      return true;
    }
    if (p?.kind !== "player" || p.by !== idx) return false;
    this.endPause();
    return true;
  }

  private endPause(): void {
    const p = this.state.pause;
    if (!p) return;
    this.state.pause = null;
    this.state.events.push({ e: "pause", on: false, kind: p.kind, by: p.by });
  }

  /** Runs the pause clocks and the tactical schedule; true while the match is paused (the tick is skipped). */
  private pauseStep(): boolean {
    const st = this.state;
    const cfg = st.config;
    if (cfg.pause === "tactical" && !st.pause && st.nextTactical !== undefined) {
      const warn = st.nextTactical - Math.round(RULES.tacticalWarn * TICK_HZ);
      if (st.tick === warn) st.events.push({ e: "pauseWarn", in: RULES.tacticalWarn });
      if (st.tick >= st.nextTactical) {
        st.pause = { kind: "tactical", left: cfg.tacticalLength ?? RULES.tacticalLength, ready: [false, false] };
        st.nextTactical = st.tick + Math.round((cfg.tacticalEvery ?? RULES.tacticalEvery) * TICK_HZ);
        st.events.push({ e: "pause", on: true, kind: "tactical" });
      }
    }
    const p = st.pause;
    const bank = st.pauseBank;
    if (!p) {
      // Unused pause time slowly comes back.
      const regen = ((cfg.pauseRegen ?? RULES.pauseRegen) / 60) * DT;
      const max = cfg.pauseBank ?? RULES.pauseBank;
      if (bank && regen > 0) for (const i of [0, 1] as const) if (bank[i] >= 0) bank[i] = Math.min(max, bank[i] + regen);
      return false;
    }
    if (p.kind === "player" && bank && p.by !== undefined) {
      if (bank[p.by] >= 0) bank[p.by] = Math.max(0, bank[p.by] - DT);
      p.left = bank[p.by];
      if (bank[p.by] === 0) this.endPause();
    } else {
      p.left -= DT;
      if (p.left <= 0) this.endPause();
    }
    return true;
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

  /** Losing drone power switches drones off from the last slot back; deployed ones go offline, not away. */
  private clampDrones(ship: ShipState): void {
    const cap = this.eff(ship.systems.drones);
    const ds = ship.drones ?? [];
    for (let i = ds.length - 1; i >= 0 && this.droneLoad(ship) > cap; i--) {
      if (!ds[i].powered) continue;
      ds[i].powered = false;
      ds[i].launch = 0;
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
        d.cd = bp.type === "SHIELD" ? RULES.shieldDroneTimes[Math.min(4, ship.superShield ?? 0)] : 1.2;
        d.repairLeft = bp.type === "SHIP_REPAIR" ? RULES.shipRepairAmount : undefined;
      }
      if (UNIT_DRONES.includes(bp.type)) continue;
      // A Shield Overcharger holds still while it pours the charge into the shield (same cycle length).
      const charging = bp.type === "SHIELD" && d.cd <= RULES.shieldDroneCharge && (ship.superShield ?? 0) < RULES.shieldDroneMax;
      if (!charging) d.angle += DT * (0.25 + bp.speed * 0.02) * boost;
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
          if (target) this.loseDrone(enemy, target.slot);
          else d.cd = 0.5;
          continue;
        }
        const lasersToo = bp.id !== "DEFENSE_1";
        const incoming = st.projectiles
          .filter((p) => p.from === enemy.idx && p.delay <= 0 && p.flight - p.t > RULES.interceptMin && p.weapon !== "__ASB" && (p.kind === "MISSILES" || p.kind === "BOARDER" || p.kind === "HACK" || p.weapon === "__ASTEROID" || (lasersToo && (p.kind === "LASER" || p.kind === "BURST"))))
          .sort((a, b) => a.flight - a.t - (b.flight - b.t))[0];
        if (incoming) {
          st.projectiles = st.projectiles.filter((p) => p !== incoming);
          if (incoming.boarder !== undefined) this.loseDrone(enemy, incoming.boarder);
          if (incoming.kind === "HACK") enemy.hack = undefined;
          st.events.push({ e: "intercept", ship: ship.idx, projectile: incoming.id, drone: d.slot });
        } else d.cd = 0.1;
      } else if (bp.type === "SHIELD") {
        // Shield Overcharger: tops up the Zoltan super shield a point at a time, sooner the fewer it has
        // (wiki: 8 / 10 / 13 / 16 / 20 s with 0-4 points).
        ship.superShield = Math.min(RULES.shieldDroneMax, (ship.superShield ?? 0) + 1);
        d.cd = RULES.shieldDroneTimes[Math.min(4, ship.superShield ?? 0)];
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
    return ship.crew.find((c) => !c.dead && !c.dying && c.owner === ship.idx && c.drone === undefined && c.stun <= 0 && c.path.length === 0 && c.tile === s.station);
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
        if (this.manSkill(ship, s.id) !== undefined) s.manBonus = 1;
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
    // Autonomous ship with nobody aboard: its systems mend themselves.
    if (this.autonomous(ship)) {
      const g = this.geo(ship);
      for (const s of Object.values(ship.systems)) {
        if (!s || s.damage <= 0) continue;
        // FTL: no repairs in a room with fire or a breach (a fire also loses the progress), or with intruders in it.
        const rs = ship.rooms.find((r) => r.id === s.room);
        if (rs && Object.keys(rs.fires).length) s.repair = 0;
        if (!rs || Object.keys(rs.fires).length || Object.keys(rs.breaches).length || ship.crew.some((c) => c.owner !== ship.idx && !c.dead && g.tiles.get(c.tile)?.room === s.room)) continue;
        s.repair += RULES.autoRepair * DT;
        if (s.repair >= 1) {
          s.repair = 0;
          s.damage--;
        }
      }
    }
    // Shields
    const sh = ship.systems.shields;
    const max = Math.floor(this.eff(sh) / 2);
    if (ship.shieldLayers > max) {
      ship.shieldLayers = max;
      ship.shieldCharge = 0;
    }
    if (ship.shieldLayers < max) {
      const m = this.manSkill(ship, "shields");
      const bonus = (m !== undefined ? RULES.shieldManBonus[m] : 0) + augCount(ship, "SHIELD_RECHARGE") * (this.db.augments?.SHIELD_RECHARGE?.value ?? 0.15);
      ship.shieldCharge += (DT / RULES.shieldRecharge) * (1 + bonus);
      if (ship.shieldCharge >= 1) {
        ship.shieldLayers++;
        ship.shieldCharge = 0;
      }
    } else ship.shieldCharge = 0;
  }

  /**
   * The ship runs itself: none of its own crew are alive aboard, and either the match is in autonomous mode or
   * it's the Rebel flagship (FTL: "the AI took control of the ship" when its crew die).
   */
  autonomous(ship: ShipState): boolean {
    if (this.state.config.winCondition !== "auto" && !/^BOSS_/.test(ship.bp) && !this.db.ships[ship.bp]?.auto) return false;
    return !ship.crew.some((c) => c.owner === ship.idx && c.drone === undefined && !c.dead && c.dying === undefined);
  }

  /**
   * The skill a system is manned with: its crew member's, or (an autonomous ship) 0 for every undamaged system,
   * hacked or not, as FTL's automated ships treat them as manned. Undefined when unmanned.
   */
  manSkill(ship: ShipState, id: SystemId): number | undefined {
    const m = this.mannedBy(ship, id);
    const sk: Record<string, SkillId> = { pilot: "pilot", engines: "engines", shields: "shields", weapons: "weapons" };
    if (m) return sk[id] ? this.skill(m, sk[id]) : 0;
    const s = ship.systems[id];
    return s && s.damage === 0 && s.station && this.autonomous(ship) ? 0 : undefined;
  }

  /** A system wrecked by something other than a weapon hit (boarders, fire) also costs the ship 1 hull (FTL). */
  private wrecked(ship: ShipState, sys: SystemState): void {
    if (sys.damage < sys.level || this.god.has(ship.idx)) return;
    ship.hull = Math.max(0, ship.hull - 1);
  }

  /** Evasion % (0..100). Needs a working helm; manned helm and engines add their bonuses. */
  evasionOf(ship: ShipState): number {
    const eng = this.eff(ship.systems.engines);
    const pilotSys = ship.systems.pilot;
    const pilotPower = this.eff(pilotSys);
    if (eng <= 0 || pilotPower <= 0) return 0;
    const pilot = this.manSkill(ship, "pilot");
    let ev = RULES.engineEvasion[Math.min(8, eng)];
    const em = this.manSkill(ship, "engines");
    if (em !== undefined) ev += RULES.engineManBonus[em];
    if (pilot !== undefined) return ev + RULES.pilotManBonus[pilot];
    return Math.floor(ev * RULES.autopilot[Math.min(3, pilotPower)]);
  }

  /**
   * FTL remembers the power a player gave each system, gun and drone: what damage, ion or a power shortage
   * took away comes back by itself once it's repaired (or the ion wears off, or the reactor frees up), most
   * vital systems first. Only the player taking power off lowers what's remembered.
   */
  private restorePower(ship: ShipState): void {
    for (const s of Object.values(ship.systems)) if (s && !isSubsystem(s.id)) s.want ??= s.power;
    for (const w of ship.weapons) w.want ??= w.powered;
    for (const d of ship.drones ?? []) d.want ??= d.powered;
    const order: SystemId[] = ["shields", "engines", "oxygen", "medbay", "clonebay", "weapons", "teleporter", "cloaking", "hacking", "mind", "artillery", "artillery2", "artillery3", "artillery4", "drones"];
    for (const id of order) {
      const s = ship.systems[id];
      if (!s || s.ion > 0 || s.locked) continue;
      if (id === "weapons") {
        ship.weapons.forEach((w, slot) => {
          if (w.want && !w.powered) this.apply(ship, { c: "weaponPower", slot, on: true });
        });
      } else if (id === "drones") {
        (ship.drones ?? []).forEach((d, slot) => {
          if (d.want && !d.powered) this.apply(ship, { c: "dronePower", slot, on: true });
        });
      } else {
        const want = s.want ?? 0;
        while (s.power < want && this.apply(ship, { c: "power", system: id, delta: 1 })) {}
        s.want = want;
      }
    }
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
    const m = this.manSkill(ship, "weapons");
    if (m !== undefined) cd *= 1 - RULES.weaponManBonus[m];
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
        // A hacked weapons system can't fire and its charge runs back down; charges a charge weapon has
        // already stored are kept (FTL), only the one building up (or the full one) drains.
        if (w.volleys >= bp.chargeLevels) {
          w.volleys = bp.chargeLevels - 1;
          w.charge = cd;
        }
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
        // Flak throws all its pieces at once (they spread over the target area); other volleys are staggered.
        id: st.nextId++, from: ship.idx, weapon: bp.id, slot, kind: bp.type, delay: bp.type === "BURST" ? 0 : i * RULES.shotSpacing,
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
    // A hazard's shot belongs to no one: it's tallied against a throwaway copy of the stats.
    const src = p.hazard ? { ...st.ships[p.from], stats: { ...st.ships[p.from].stats } } : st.ships[p.from];
    const T = st.ships[1 - p.from];
    const g = this.geo(T);
    if (p.kind === "BOARDER") return this.landBoarder(src, T, p);
    if (p.kind === "HACK") return this.landHack(src, T, p);
    const bp = this.wbp(p.weapon);
    if (p.kind === "BEAM" && p.target.kind === "beam") return this.resolveBeam(src, T, g, bp, p.target);
    if (p.target.kind !== "room") return;
    const room = p.kind === "BURST" ? roomAt(g, p.px, p.py) : p.target.room;
    // Zoltan Shield absorbs anything that would reach the ship (bombs included) until it's used up.
    // (ASB shots go straight through a Zoltan shield without touching it.)
    const bypass = (p.kind === "BOMB" && augCount(src, "ZOLTAN_BYPASS") > 0) || p.weapon === "__ASB";
    // One evasion roll per shot (bombs never miss); whatever gets through meets the super shield first, and
    // only once that's gone the ordinary shield layers.
    if (p.kind !== "BOMB" && (room < 0 || this.rng.chance(T.evasion / 100))) {
      src.stats.misses++;
      st.events.push({ e: "miss", ship: T.idx, px: p.px, py: p.py, weapon: p.weapon });
      this.gainXp(this.mannedBy(T, "pilot"), "pilot");
      this.gainXp(this.mannedBy(T, "engines"), "engines");
      return;
    }
    if (!bypass && (T.superShield ?? 0) > 0 && room >= 0) {
      T.superShield = Math.max(0, (T.superShield ?? 0) - Math.max(1, bp.damage + bp.ion));
      src.stats.blocked++;
      st.events.push({ e: "shield", ship: T.idx, px: p.px, py: p.py, weapon: p.weapon });
      return;
    }
    if (p.kind !== "BOMB") {
      if (T.shieldLayers > bp.sp) {
        T.shieldLayers--;
        T.shieldCharge = 0;
        if (bp.ion > 0 && T.systems.shields && !this.ionNegated(T)) this.addIon(T.systems.shields, bp.ion);
        src.stats.blocked++;
        st.events.push({ e: "shield", ship: T.idx, px: p.px, py: p.py, weapon: p.weapon });
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
      st.events.push({ e: "beam", ship: T.idx, x1: t.x1, y1: t.y1, x2, y2, blocked: true, weapon: bp.id });
      src.stats.blocked++;
      return;
    }
    // Each shield layer takes a point off a beam, less the weapon's piercing (the Fed artillery pierces all).
    const layers = Math.max(0, T.shieldLayers - (bp.sp ?? 0));
    const dmg = bp.damage - layers;
    const blocked = dmg <= 0 && (bp.damage > 0 || layers > 0);
    st.events.push({ e: "beam", ship: T.idx, x1: t.x1, y1: t.y1, x2, y2, blocked, weapon: bp.id });
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
      const before = T.hull;
      T.hull = Math.max(0, T.hull - hullDmg);
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
      if (sd > 0 && !casing) this.hurtSystem(sys, sd);
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
    st.events.push({ e: "hit", ship: T.idx, room, damage: hullDmg, px, py, weapon: bp.id });
  }

  // ---------------------------------------------------------------- crew

  private crewTick(ship: ShipState): void {
    const st = this.state;
    const g = this.geo(ship);
    const medbay = ship.systems.medbay;
    const heal = RULES.medbayHeal[Math.min(3, this.eff(medbay))];
    const doorLevel = Math.min(RULES.doorBreak.length - 1, this.eff(ship.systems.doors));
    this.refillStations(ship, g);
    this.cloneTick(ship, g);
    /** Boarders who died here go home to their owner's ship (its clone bay may bring them back). */
    const leaving: CrewState[] = [];
    /** Crew whose beam-out finished: moved aboard the other ship after the loop. */
    const moving: [CrewState, ShipState, string][] = [];
    for (const c of ship.crew) {
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
          if (c.drone === undefined && ocb && ocb.level > 0) {
            c.clone = 0;
            c.diedAt = st.tick;
          }
          st.events.push({ e: "death", ship: ship.idx, crew: c.id });
          if (c.drone !== undefined || c.owner !== ship.idx) leaving.push(c);
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
      if (tr.drainO2) this.airLoss(ship, g, room, RULES.breachDrain * tr.drainO2);
      if (this.god.has(c.owner)) c.hp = c.maxHp;
      // Only a working medbay heals (powered, not wrecked or hacked), and only its own ship's crew.
      c.healing = ownShip && c.drone === undefined && !!medbay && !medbay.hacked && medbay.room === room && heal > 0 && c.path.length === 0 && c.hp < c.maxHp;
      if (c.healing) c.hp = Math.min(c.maxHp, c.hp + heal * DT);
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
        this.endAttack(c);
        continue;
      }
      // Fresh out of the clone bay: the materialise animation plays first.
      if (c.spawn !== undefined) {
        c.spawn -= DT;
        if (c.spawn <= 0) c.spawn = undefined;
        c.task = "idle";
        continue;
      }
      if (c.stun > 0) {
        c.stun -= DT;
        continue;
      }
      // Teleporting: the beam-out plays, then they're moved across and the beam-in plays.
      if (c.beam) {
        c.beam.t -= DT;
        c.task = "idle";
        c.path = [];
        this.endAttack(c);
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
      // A drone unit whose drone lost power stands where it is, switched off, until it's powered again.
      if (c.drone !== undefined && !home.drones?.[c.drone]?.powered) {
        if (c.path.length) {
          c.path = [];
          [c.x, c.y] = unkey(c.tile);
        }
        c.task = "idle";
        this.endAttack(c);
        continue;
      }
      const hostiles = ship.crew.filter((q) => q.owner !== c.owner && !q.dead && q.dying === undefined && g.tiles.get(q.tile)?.room === room);
      // Drone units and mind-controlled crew think for themselves (players can't order them).
      if (!c.path.length && !hostiles.length) {
        if (c.drone !== undefined) this.unitThink(ship, g, c, room);
        else if (c.mind) this.mindThink(ship, g, c, room);
      }
      // Movement. Intruders have to break closed doors first (longer for better doors).
      if (c.path.length) {
        this.endAttack(c);
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
          // FTL: with no door system or a level-1 one there's no security, so intruders just open the door and
          // walk through; from level 2 (or a manned level 1) they have to shoot it down. A hacking lock is a
          // blast door whatever the level.
          const secure = locked || doorLevel >= 2;
          if (!hackerCrew && (locked || (!ownShip && secure))) {
            // Everyone shooting the same door wears it down together.
            const db = (ship.doorBash ??= ship.doors.map(() => 0));
            db[door] = (db[door] ?? 0) + DT * Math.max(0.5, tr.combat);
            c.bash = db[door];
            c.task = "fight";
            const dd = g.doors[door];
            // Breaking a door is shooting it, facing the door.
            c.aim = [dd.px / TILE - 0.5, dd.py / TILE - 0.5];
            c.punch = false;
            c.face = bestFit(c.aim[0] - c.x, c.aim[1] - c.y);
            // A hacked lock is as strong as level-3 blast doors (wiki).
            if (c.bash >= RULES.doorBreak[locked ? Math.max(3, doorLevel) : doorLevel]) {
              ship.doorPass![door] = RULES.doorBrokenOpen;
              ship.doorBash![door] = 0;
              c.bash = 0;
              st.events.push({ e: "doorBroken", ship: ship.idx, door });
            }
            continue;
          }
          // Anyone else opens it as they pass.
          ship.doorPass![door] = Math.max(ship.doorPass![door], RULES.doorPassOpen + 1 / (RULES.crewSpeed * tr.speed));
        }
        c.bash = 0;
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
        this.fight(ship, g, c, hostiles, tr);
        continue;
      }
      this.endAttack(c);
      if (!ownShip) {
        // Boarders wreck the system in their room (ion intruders ionise it instead).
        if (sys && (tr.ionBoarder ? sys.level > 0 : sys.damage < sys.level)) {
          // The progress belongs to the system: every boarder working it adds to it, a fight in the room pauses
          // it (nobody's wrecking while they brawl), and it's only lost once the last boarder has left the
          // room. Breaking a door on the way in doesn't count.
          sys.wreck = (sys.wreck ?? 0) + (RULES.sabotageRate * Math.max(0.5, tr.combat) * (tr.sabotage ?? 1) * DT) / this.toughness(sys);
          if (sys.wreck >= 1) {
            sys.wreck = 0;
            if (tr.ionBoarder) this.addIon(sys, 1);
            else {
              sys.damage = Math.min(sys.level, sys.damage + 1);
              sys.repair = 0;
              this.gainXp(c, "combat");
              this.wrecked(ship, sys);
            }
          }
          c.task = "sabotage";
          c.face = sabotageFacing(g, room, c.tile);
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
    // (An autonomous ship repairs itself with nobody there.)
    for (const sys of this.autonomous(ship) ? [] : Object.values(ship.systems)) {
      if (!sys || sys.repair <= 0) continue;
      const present = ship.crew.some((q) => q.owner === ship.idx && !q.dead && q.dying === undefined && g.tiles.get(q.tile)?.room === sys.room && !(q.path.length && g.tiles.get(q.path[q.path.length - 1])?.room !== sys.room));
      if (!present) sys.repair = 0;
    }
    // Wrecking progress lasts while any boarder is still in the room (walking, fighting or working); once
    // they've all gone it's lost. The HUD's bar shows it (ion intruders' progress isn't shown as damage).
    for (const s of Object.values(ship.systems)) {
      if (!s) continue;
      const boarders = ship.crew.filter((q) => q.owner !== ship.idx && !q.dead && q.dying === undefined && g.tiles.get(q.tile)?.room === s.room);
      if (!boarders.length) s.wreck = 0;
      s.sabotage = boarders.some((q) => !raceOf(q.race).ionBoarder) ? s.wreck ?? 0 : 0;
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

  /**
   * One attack as FTL runs it: each swing lasts 1-1.3 s and picks its target when it starts (whoever shares the
   * tile, else anyone in the room), and its damage lands half-way through. Sharing a tile means a punch (the
   * ship's own crew stand on top facing down, intruders below facing up); otherwise it's a shot from where they
   * stand. Drone units never punch. Damage averages `meleeDps` (FTL rolls 3-7 a hit).
   */
  private fight(ship: ShipState, g: Geometry, c: CrewState, hostiles: CrewState[], tr: ReturnType<typeof raceOf>): void {
    let foe = c.foe !== undefined ? hostiles.find((q) => q.id === c.foe) : undefined;
    if (!foe) c.atk = 0;
    if ((c.atk ?? 0) <= 0) {
      const same = hostiles.find((q) => q.tile === c.tile && q.path.length === 0);
      foe = same ?? this.rng.pick(hostiles);
      c.foe = foe.id;
      c.atk = c.atkDur = 1 + this.rng.next() * 0.3;
      c.hit = false;
      c.punch = !!same && !tr.drone;
      c.face = same ? (c.owner === ship.idx ? "down" : "up") : bestFit(foe.x - c.x, foe.y - c.y);
      c.aim = [foe.x, foe.y];
    }
    c.atk = (c.atk ?? 0) - DT;
    if (!c.hit && c.atk <= (c.atkDur ?? 1) / 2) {
      c.hit = true;
      const roll = 0.6 + this.rng.next() * 0.8;
      foe!.hp -= RULES.meleeDps * (c.atkDur ?? 1) * roll * tr.combat * (1 + RULES.combatSkillBonus[this.skill(c, "combat")]) * (1 + (c.mind?.boost ?? 0));
      if (foe!.hp <= 0) this.gainXp(c, "combat", 2);
    }
    c.task = "fight";
    void g;
  }

  private endAttack(c: CrewState): void {
    c.foe = c.atk = c.atkDur = c.hit = c.punch = c.aim = undefined;
  }

  /** The nearest of `rooms` by walking distance (null when none is reachable). */
  private nearestRoom(g: Geometry, from: string, rooms: number[]): number | null {
    let best: number | null = null;
    let bestLen = Infinity;
    for (const r of rooms) {
      const t = g.roomTiles.get(r)?.[0];
      if (!t) continue;
      const p = t === from ? [] : findPath(g, from, t);
      if (p && p.length < bestLen) {
        bestLen = p.length;
        best = r;
      }
    }
    return best;
  }

  /** Rooms with a system still worth wrecking (ion intruders: one not fully ionised). */
  private workingSystemRooms(ship: ShipState, ion = false): number[] {
    return Object.values(ship.systems).filter((s) => s && s.level > 0 && (ion ? s.ion < s.level : s.damage < s.level)).map((s) => s!.room);
  }

  /** Drone unit AI: anti-personnel hunts intruders, repair drones go to damaged systems, boarders to the nearest working system. */
  private unitThink(ship: ShipState, g: Geometry, c: CrewState, room: number): void {
    const race = c.race;
    let target: number | null = null;
    const droneRoom = ship.systems.drones?.room;
    if (c.owner === ship.idx && droneRoom !== undefined && c.hp < c.maxHp * 0.4) {
      // Badly hurt interior drones go home to the drone room to repair themselves.
      target = droneRoom;
    } else if (race === "battle") {
      const rooms = ship.crew.filter((q) => q.owner !== c.owner && !q.dead && q.dying === undefined).map((q) => g.tiles.get(q.tile)!.room);
      target = this.nearestRoom(g, c.tile, [...new Set(rooms)]);
    } else if (race === "repair") {
      const here = Object.values(ship.systems).find((s) => s && s.room === room && s.damage > 0);
      if (!here) target = this.nearestRoom(g, c.tile, Object.values(ship.systems).filter((s) => s && s.damage > 0).map((s) => s!.room));
    } else {
      const ion = !!raceOf(race).ionBoarder;
      const rooms = this.workingSystemRooms(ship, ion);
      if (!rooms.includes(room)) target = this.nearestRoom(g, c.tile, rooms);
    }
    if (target !== null && target !== room) this.sendCrew(ship, g, c, target);
  }

  /**
   * Mind-controlled crew stay AI-driven whoever controls them. Aboard their own ship they act as the
   * controller's intruders: head for the nearest working system to wreck it, fighting anyone in the way.
   * Aboard the controller's ship they act as its crew: go after intruders, then fires, breaches and damage.
   */
  private mindThink(ship: ShipState, g: Geometry, c: CrewState, room: number): void {
    let rooms: number[];
    if (c.owner !== ship.idx) rooms = this.workingSystemRooms(ship);
    else {
      const foes = ship.crew.filter((q) => q.owner !== c.owner && !q.dead && q.dying === undefined).map((q) => g.tiles.get(q.tile)!.room);
      const trouble = ship.rooms.filter((r) => Object.keys(r.fires).length || Object.keys(r.breaches).length || Object.values(ship.systems).some((s) => s && s.room === r.id && s.damage > 0)).map((r) => r.id);
      rooms = foes.length ? [...new Set(foes)] : trouble;
    }
    if (!rooms.length || rooms.includes(room)) return;
    const target = this.nearestRoom(g, c.tile, rooms);
    if (target !== null) this.sendCrew(ship, g, c, target);
  }

  /** Clone bay: one at a time, in the order they died; switched off, it loses the last in line every 3 s. */
  private cloneTick(ship: ShipState, g: Geometry): void {
    const cb = ship.systems.clonebay;
    const queue = ship.crew.filter((c) => c.dead && c.clone !== undefined).sort((a, b) => (a.diedAt ?? 0) - (b.diedAt ?? 0) || a.id - b.id);
    if (!queue.length || !cb) {
      ship.cloneDying = 0;
      return;
    }
    const p = this.eff(cb);
    if (p > 0) {
      ship.cloneDying = 0;
      const head = queue[0];
      head.clone = (head.clone ?? 0) + DT / RULES.cloneTime[Math.min(3, p)];
      if (head.clone >= 1) this.respawn(ship, g, head, cb.room);
      return;
    }
    // Progress on the head is lost while it's off; Backup DNA Bank keeps the queue alive.
    queue[0].clone = 0;
    if (augCount(ship, "BACKUP_DNA")) return;
    ship.cloneDying = (ship.cloneDying ?? 0) + DT / RULES.cloneLoss;
    if (ship.cloneDying >= 1) {
      ship.cloneDying = 0;
      queue[queue.length - 1].clone = undefined;
    }
  }

  // ---------------------------------------------------------------- boarding

  // ---------------------------------------------------------------- battery, mind control, artillery

  /** Reactor bars available now: the reactor plus the battery (a hacked battery takes two away). */
  cap(ship: ShipState): number {
    // An ion storm halves the reactor (rounded up); the battery's bars come on top, as in FTL.
    const reactor = this.state.hazard?.kind === "storm" ? Math.ceil(ship.reactor / 2) : ship.reactor;
    return Math.max(0, reactor + (ship.reactorBonus ?? 0));
  }

  // ---------------------------------------------------------------- hazards

  private hazardDelay(k: string): number {
    const r = (a: number[]) => a[0] + this.rng.next() * (a[1] - a[0]);
    return k === "sun" ? r(RULES.flareEvery) : k === "pulsar" ? r(RULES.pulsarEvery) : k === "asb" ? r(RULES.asbEvery) : 0;
  }

  private hazardTick(): void {
    const st = this.state;
    const hz = st.hazard;
    if (!hz || st.winner !== null) return;
    if (hz.kind === "asteroids") return this.asteroidTick(hz);
    if (hz.kind !== "sun" && hz.kind !== "pulsar" && hz.kind !== "asb") return;
    hz.next -= DT;
    if (!hz.warned && hz.next <= RULES.hazardWarn) {
      hz.warned = true;
      if (hz.kind === "asb") st.events.push({ e: "hazard", kind: "asb", ship: hz.asbTarget, in: RULES.hazardWarn });
      else st.events.push({ e: "hazard", kind: "warn", in: RULES.hazardWarn });
    }
    if (hz.next > 0) return;
    hz.next = this.hazardDelay(hz.kind);
    hz.warned = false;
    if (hz.kind === "sun") for (const s of st.ships) this.solarFlare(s);
    else if (hz.kind === "pulsar") for (const s of st.ships) this.pulsarPulse(s);
    else {
      // The batteries take turns: this shot at one ship, the next at the other.
      const T = st.ships[hz.asbTarget ?? 0];
      hz.asbTarget = (1 - T.idx) as 0 | 1;
      this.hazardShot(T, "__ASB", RULES.asbFlight);
    }
  }

  /** A red giant's flare (wiki/xftl): 1-2 fires with shields up, 3-6 without, 1-2 per room; 33/66 % of 1 damage there. */
  private solarFlare(ship: ShipState): void {
    const st = this.state;
    const g = this.geo(ship);
    const shielded = ship.shieldLayers > 0 || (ship.superShield ?? 0) > 0;
    let left = shielded ? 1 + this.rng.int(2) : 3 + this.rng.int(4);
    st.events.push({ e: "hazard", kind: "flare", ship: ship.idx });
    while (left > 0) {
      const rs = this.rng.pick(ship.rooms);
      const n = left === 1 ? 1 : 1 + this.rng.int(2);
      left -= n;
      const tiles = g.roomTiles.get(rs.id)!;
      for (let i = 0; i < n; i++) {
        const t = this.rng.pick(tiles);
        if (!(t in rs.fires)) st.events.push({ e: "fireStart", ship: ship.idx, room: rs.id });
        rs.fires[t] = RULES.fireHp;
      }
      if (this.god.has(ship.idx) || !this.rng.chance(n === 1 ? 0.33 : 0.66)) continue;
      ship.hull = Math.max(0, ship.hull - 1);
      const sys = Object.values(ship.systems).find((s) => s && s.room === rs.id);
      if (sys) this.hurtSystem(sys, 1);
    }
  }

  /**
   * A pulsar's ion pulse (wiki): two random systems ionised by 1 + half their power (subsystems by their level),
   * the shields always one of them while powered; a Zoltan shield soaks the whole pulse (3-4 off it), and
   * Reverse Ion Field can resist it all.
   */
  private pulsarPulse(ship: ShipState): void {
    const st = this.state;
    st.events.push({ e: "hazard", kind: "pulse", ship: ship.idx });
    if ((ship.superShield ?? 0) > 0 && ship.systems.shields) {
      ship.superShield = Math.max(0, (ship.superShield ?? 0) - (3 + this.rng.int(2)));
      return;
    }
    if (this.ionNegated(ship)) return;
    const all = Object.values(ship.systems).filter((s): s is SystemState => !!s && s.level > 0);
    const picks: SystemState[] = [];
    const sh = ship.systems.shields;
    if (sh && sh.power > 0) picks.push(sh);
    while (picks.length < 2 && picks.length < all.length) {
      const s = this.rng.pick(all);
      if (!picks.includes(s)) picks.push(s);
    }
    for (const s of picks) {
      const n = isSubsystem(s.id) ? usable(s) + (s.manBonus ?? 0) : s.power > 0 ? 1 + Math.floor(0.5 * s.power) : 1;
      this.addIon(s, Math.max(1, n));
    }
  }

  /** A hazard's projectile (an asteroid, an ASB shot) flying at a random room of `ship`. */
  private hazardShot(ship: ShipState, weapon: string, flight: number): void {
    const st = this.state;
    const g = this.geo(ship);
    const room = this.rng.pick(ship.rooms).id;
    const [tx, ty] = unkey(this.rng.pick(g.roomTiles.get(room)!));
    st.projectiles.push({
      id: st.nextId++, from: (1 - ship.idx) as 0 | 1, weapon, slot: -1, kind: "LASER", delay: 0, t: 0, flight,
      target: { kind: "room", room }, px: (tx + 0.5) * TILE, py: (ty + 0.5) * TILE, damageBonus: 0, hazard: true,
    });
  }

  /**
   * Asteroid field (xftl's AsteroidGenerator): lulls and two kinds of wave, timed by each ship's own shield
   * bubbles (more shields, more rocks). FTL alternates one stream between both ships; here each ship has its own
   * at half the rate, which comes to the same.
   */
  private asteroidTick(hz: NonNullable<MatchState["hazard"]>): void {
    const T = [
      { idle: [5, 10], w1: [8, 16], p1: [1.8, 2.2], w2: [5, 8], p2: [1.4, 1.6] },
      { idle: [5, 10], w1: [10, 20], p1: [1.0, 1.8], w2: [5, 10], p2: [0.9, 1.3] },
      { idle: [12, 15], w1: [16, 28], p1: [0.9, 1.4], w2: [8, 13], p2: [0.9, 1.3] },
      { idle: [12, 15], w1: [16, 30], p1: [0.72, 1.35], w2: [8, 11], p2: [0.54, 0.95] },
    ];
    const r = (a: number[]) => a[0] + this.rng.next() * (a[1] - a[0]);
    for (const ship of this.state.ships) {
      const g = hz.rocks![ship.idx];
      const bubbles = Math.floor((ship.systems.shields?.level ?? 0) / 2);
      const t = T[Math.max(0, Math.min(3, bubbles - 1))];
      g.left -= DT;
      if (g.phase > 0) {
        g.spawn -= DT;
        if (g.spawn <= 0) {
          g.spawn = 2 * r(g.phase === 1 ? t.p1 : t.p2);
          this.hazardShot(ship, "__ASTEROID", RULES.asteroidFlight);
        }
      }
      if (g.left > 0) continue;
      g.phase = g.phase === 0 ? 1 : g.phase === 1 ? 2 : 0;
      g.left = r(g.phase === 0 ? t.idle : g.phase === 1 ? t.w1 : t.w2);
      g.spawn = 0;
    }
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
    const held = (s: ShipState) => new Set([...s.crew.filter((q) => q.owner === ship.idx && !q.dead).flatMap((q) => [q.tile, q.home]), ...blockedTiles(s)]);
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
      // (Boarders stranded by a ship that's gone can't be pulled back: this teleporter isn't theirs.)
      const coming = enemy.crew.filter((c) => c.owner === ship.idx && c.drone === undefined && !c.dead && c.dying === undefined && !c.beam && !c.stranded && eg.tiles.get(c.tile)?.room === room);
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
      // It punches into a system room (FTL's boarding drone always lands on one), a working one if it can.
      const working = this.workingSystemRooms(enemy, bpId === "BOARDER_ION");
      const any = Object.values(enemy.systems).filter((x) => x && x.level > 0).map((x) => x!.room);
      const room = working.length ? this.rng.pick(working) : any.length ? this.rng.pick(any) : this.rng.pick(enemy.rooms).id;
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
    for (const t of blockedTiles(aboard)) taken.add(t);
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
    if (!d || !d.deployed || p.target.kind !== "room") return;
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
    d.want = false;
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
    for (const t of blockedTiles(ship)) taken.add(t);
    const tiles = g.roomTiles.get(room) ?? [];
    const tile = tiles.find((t) => !taken.has(t)) ?? [...g.tiles.keys()].find((t) => !taken.has(t)) ?? tiles[0];
    const [x, y] = unkey(tile);
    Object.assign(c, { dead: false, clone: undefined, dying: undefined, diedAt: undefined, hp: c.maxHp, tile, home: tile, x, y, path: [], task: "idle", stun: 0, spawn: RULES.cloneSpawn });
    this.state.events.push({ e: "clone", ship: ship.idx, crew: c.id });
  }

  // ---------------------------------------------------------------- fire, breaches, oxygen

  /**
   * Air lost to a leak in `room` (breaches, a Lanius) at `rate` %/s: the room itself, and every room joined
   * to it through open doors at `breachFalloff` per room of distance (FTL's ComputeAirLoss).
   */
  private airLoss(ship: ShipState, g: Geometry, room: number, rate: number): void {
    const dist = new Map([[room, 0]]);
    const queue = [room];
    while (queue.length) {
      const r = queue.shift()!;
      g.doors.forEach((d, i) => {
        if (d.roomA < 0 || d.roomB < 0 || !this.doorOpen(ship, i)) return;
        const next = d.roomA === r ? d.roomB : d.roomB === r ? d.roomA : -1;
        if (next < 0 || dist.has(next)) return;
        dist.set(next, dist.get(r)! + 1);
        queue.push(next);
      });
    }
    for (const rs of ship.rooms) {
      const k = dist.get(rs.id);
      if (k !== undefined) rs.o2 = Math.max(0, rs.o2 - rate * RULES.breachFalloff ** k * DT);
    }
  }

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
      if (nb) this.airLoss(ship, g, rs.id, RULES.breachDrain * nb);
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
        sys.fireDmg += (DT * burning) / RULES.fireSysSeconds / this.toughness(sys);
        if (sys.fireDmg >= 1) {
          sys.fireDmg = 0;
          if (sys.damage < sys.level) {
            sys.damage++;
            sys.repair = 0;
            this.wrecked(ship, sys);
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
      if (s.hull <= 0) return "ship destroyed";
      // Autonomous ships fly on without crew: only destruction ends it.
      // (Nor is the Rebel flagship: its AI takes over when the crew are dead.)
      if (st.config.winCondition !== "auto" && !/^BOSS_/.test(s.bp) && !this.db.ships[s.bp]?.auto && !this.crewOf(s.idx).some((c) => !c.dead) && !this.canStillClone(s)) return "crew lost";
      return "";
    });
    if (lost[0] || lost[1]) {
      st.winner = lost[0] && lost[1] ? -1 : lost[0] ? 1 : 0;
      st.endReason = lost[0] && lost[1] ? `both: ${lost[0]} / ${lost[1]}` : (lost[0] || lost[1]);
    } else if (st.config.timeLimit > 0 && st.tick >= st.config.timeLimit * TICK_HZ) {
      const score = (s: ShipState) => s.hull / s.maxHull;
      const a = score(st.ships[0]);
      const b = score(st.ships[1]);
      st.winner = a === b ? -1 : a > b ? 0 : 1;
      st.endReason = "time limit";
    }
    if (st.winner !== null) st.events.push({ e: "end", winner: st.winner, reason: st.endReason });
  }

  /**
   * With everyone dead, a clone bay that still has someone in its queue keeps the player in the game, unless
   * it's been destroyed: with no crew left to repair it, that's the end (Backup DNA or not). Ion and hacking
   * wear off and power can still be given, so those only pause it (without Backup DNA the queue dies anyway).
   */
  private canStillClone(s: ShipState): boolean {
    const cb = s.systems.clonebay;
    if (!cb || cb.damage >= cb.level) return false;
    return s.crew.some((c) => c.dead && c.clone !== undefined && c.drone === undefined);
  }

  /** Stable hash of the whole state, for determinism checks. */
  hash(): string {
    const s = JSON.stringify({ ...this.state, events: [] });
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  }
}

/** FTL's facing toward a point: whichever axis is longer. */
function bestFit(dx: number, dy: number): "up" | "down" | "left" | "right" {
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : dy < 0 ? "up" : "up";
}

/**
 * Which way a saboteur faces (FTL): in a two-tile room toward the other tile; in a four-tile room the top
 * two face down, the bottom-left faces right and the bottom-right faces left.
 */
function sabotageFacing(g: Geometry, room: number, tile: string): "up" | "down" | "left" | "right" {
  const r = g.layout.rooms.find((q) => q.id === room);
  if (!r) return "up";
  const [tx, ty] = unkey(tile);
  const lx = tx - r.x;
  const ly = ty - r.y;
  if (r.w === 1) return ly === 0 ? "down" : "up";
  if (r.h === 1) return lx === 0 ? "right" : "left";
  return ly === 0 ? "down" : lx === 0 ? "right" : "left";
}

export { autoPower, key };
