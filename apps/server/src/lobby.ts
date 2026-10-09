/** Lobbies: two seats, host-set rules, hangar validation, then an authoritative match at 30 Hz. */
import type { GameDB } from "@ftl/data";
import {
  PROTOCOL_VERSION, SNAP_EVERY, type DebugInfo, type DebugOp, type LobbyPlayer, type LobbyState, type PracticeConfig, type ServerMsg,
} from "@ftl/protocol";
import {
  baseLoadout, Bot, botLoadout, DEFAULT_CONFIG, difficultyToBot, enemyLoadout, Match, priceLoadout, viewFor, type Command, type Loadout,
  type MatchConfig, type MatchEvent,
} from "@ftl/sim";

export interface Client {
  id: string;
  name: string;
  send(m: ServerMsg): void;
  lobby: Lobby | null;
}

const COUNTDOWN = 3;
const GRACE_MS = 20_000;

export class Lobby {
  phase: LobbyState["phase"] = "lobby";
  config: MatchConfig;
  players: LobbyPlayer[] = [];
  clients = new Map<string, Client>();
  match: Match | null = null;
  countdown = 0;
  private pending: [MatchEvent[], MatchEvent[]] = [[], []];
  private dropTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Practice only: bot settings, the bot itself, and debug state. */
  practiceCfg: PracticeConfig | null = null;
  private bot: Bot | null = null;
  private autopilot: Bot | null = null;
  private speed = 1;
  private speedAcc = 0;
  private wallTicks = 0;
  private reveal = false;
  private loadouts: [Loadout, Loadout] | null = null;

  constructor(public code: string, public host: string, public db: GameDB, cfg: Partial<MatchConfig>, public practice: boolean) {
    this.config = sanitizeConfig(db, { ...DEFAULT_CONFIG, seed: (Math.random() * 2 ** 31) | 0, ...cfg });
    if (practice) this.practiceCfg = { difficulty: 40, botShip: "", debug: true };
  }

  state(): LobbyState {
    return {
      code: this.code, host: this.host, phase: this.phase, config: this.config, players: this.players, countdown: this.countdown,
      practice: this.practiceCfg,
    };
  }

  broadcast(): void {
    for (const c of this.clients.values()) c.send({ t: "lobby", lobby: this.state() });
  }

  join(c: Client): string | null {
    const existing = this.players.find((p) => p.id === c.id);
    if (existing) {
      existing.connected = true;
      clearTimeout(this.dropTimers.get(c.id));
      this.clients.set(c.id, c);
      c.lobby = this;
      if (this.match) c.send({ t: "start", you: this.players.indexOf(existing) as 0 | 1 });
      this.broadcast();
      return null;
    }
    if (this.players.length >= 2) return "lobby is full";
    if (this.phase !== "lobby") return "match already started";
    const ship = this.config.shipPool[0] ?? this.db.hangar[0];
    const loadout = baseLoadout(this.db, ship);
    this.players.push({ id: c.id, name: c.name, ready: false, loadout, priced: priceLoadout(this.db, loadout, this.config.scrap, this.config.shipPool, this.config.unlimited), connected: true });
    this.clients.set(c.id, c);
    c.lobby = this;
    if (this.practice && this.players.length === 1) this.addBot();
    this.broadcast();
    return null;
  }

  private addBot(): void {
    this.players.push({ id: "bot", name: "Practice bot", ready: true, loadout: null, priced: null, connected: true, bot: true });
    this.rebuildBot();
  }

  /** The bot shops with its own (possibly boosted) budget whenever the rules or difficulty change. */
  private rebuildBot(): void {
    const p = this.players.find((q) => q.bot);
    const pc = this.practiceCfg;
    if (!p || !pc) return;
    const { level, scrapBonus } = difficultyToBot(pc.difficulty);
    const pool = this.config.shipPool.length ? this.config.shipPool : this.db.hangar;
    const seed = Math.abs(this.config.seed);
    if (pc.botShip === "@enemy" || this.db.enemies.includes(pc.botShip)) {
      // A single-player enemy hull: its own systems/weapon pool, scaled by difficulty, plus bonus hull.
      const ship = pc.botShip === "@enemy" ? this.db.enemies[seed % this.db.enemies.length] : pc.botShip;
      p.loadout = enemyLoadout(this.db, ship, level, seed, Math.round(level * 6 + scrapBonus * 14));
      p.priced = { ok: true, total: 0, lines: [], errors: [] };
    } else {
      const ship = pc.botShip && pool.includes(pc.botShip) ? pc.botShip : pool[seed % pool.length];
      const scrap = Math.round(this.config.scrap * (1 + scrapBonus));
      p.loadout = botLoadout(this.db, ship, scrap, level, this.config.seed);
      p.priced = priceLoadout(this.db, p.loadout, scrap);
    }
    p.name = `Bot (${pc.difficulty})`;
  }

  setPractice(c: Client, cfg: Partial<PracticeConfig>): string | null {
    if (!this.practiceCfg) return "not a practice lobby";
    if (c.id !== this.host) return "only the host can change the bot";
    const next = { ...this.practiceCfg };
    if (cfg.difficulty !== undefined) next.difficulty = Math.max(0, Math.min(100, Math.round(Number(cfg.difficulty) || 0)));
    if (cfg.botShip !== undefined) {
      const b = String(cfg.botShip);
      next.botShip = this.db.hangar.includes(b) || this.db.enemies.includes(b) || b === "@enemy" ? b : "";
    }
    if (cfg.debug !== undefined) next.debug = !!cfg.debug;
    this.practiceCfg = next;
    if (this.phase === "lobby") this.rebuildBot();
    else if (this.bot) this.bot.setLevel(difficultyToBot(next.difficulty).level);
    this.broadcast();
    return null;
  }

  debug(c: Client, d: DebugOp): string | null {
    if (!this.practiceCfg?.debug) return "debug tools are off";
    if (!this.players.some((p) => p.id === c.id)) return "not in this lobby";
    const m = this.match;
    const me = this.players.findIndex((p) => p.id === c.id) as 0 | 1;
    switch (d.op) {
      case "speed":
        this.speed = Math.max(0, Math.min(16, Number(d.value) || 0));
        break;
      case "step":
        if (m && this.phase === "battle") for (let i = 0; i < Math.max(1, Math.min(300, d.ticks | 0)); i++) this.stepOnce();
        break;
      case "reveal":
        this.reveal = !!d.on;
        break;
      case "god":
        if (m) d.on ? m.god.add(me) : m.god.delete(me);
        break;
      case "autopilot":
        this.autopilot = d.on ? new Bot(d.level ?? 1, 99) : null;
        break;
      case "difficulty":
        return this.setPractice(c, { difficulty: d.value });
      case "hull":
        if (m) m.state.ships[d.ship].hull = Math.max(0, Math.min(m.state.ships[d.ship].maxHull, d.value | 0));
        break;
      case "fire":
        if (m) {
          const s = m.state.ships[d.ship];
          const r = s.rooms[(Math.random() * s.rooms.length) | 0];
          const g = m.geo(s).roomTiles.get(r.id)!;
          r.fires[g[0]] = 100;
        }
        break;
      case "damage":
        if (m) {
          const s = m.state.ships[d.ship];
          const sys = Object.values(s.systems).filter(Boolean);
          const pick = sys[(Math.random() * sys.length) | 0]!;
          pick.damage = Math.min(pick.level, pick.damage + 1);
        }
        break;
      case "ion":
        if (m) {
          const s = m.state.ships[d.ship];
          const sys = Object.values(s.systems).filter((x) => x && !["pilot", "sensors", "doors"].includes(x.id));
          const pick = sys[(Math.random() * sys.length) | 0]!;
          pick.ion = Math.min(pick.level, pick.ion + 2);
          pick.ionTimer = 5;
        }
        break;
      case "hurt":
        if (m) for (const c of m.state.ships[d.ship].crew) if (!c.dead && c.dying === undefined) c.hp -= 45;
        break;
      case "restart":
        if (this.loadouts) this.start();
        break;
    }
    this.sendSnaps();
    return null;
  }

  leave(c: Client, hard: boolean): void {
    const p = this.players.find((q) => q.id === c.id);
    this.clients.delete(c.id);
    c.lobby = null;
    if (!p) return;
    if (this.phase === "battle" && !hard) {
      // Disconnected mid-battle: hold the seat for a grace period, then forfeit.
      p.connected = false;
      this.dropTimers.set(c.id, setTimeout(() => this.forfeit(p.id, "opponent disconnected"), GRACE_MS));
    } else if (this.phase === "battle") {
      this.forfeit(p.id, "opponent left");
    } else {
      this.players = this.players.filter((q) => q !== p);
      if (this.host === c.id && this.players[0]) this.host = this.players[0].id;
      for (const q of this.players) q.ready = q.bot ?? false;
      if (this.phase === "countdown") this.phase = "lobby";
    }
    this.broadcast();
  }

  private forfeit(id: string, reason: string): void {
    if (!this.match || this.match.over) return;
    const idx = this.players.findIndex((p) => p.id === id);
    const st = this.match.state;
    st.winner = (1 - idx) as 0 | 1;
    st.endReason = reason;
    this.pending[0].push({ e: "end", winner: st.winner, reason });
    this.pending[1].push({ e: "end", winner: st.winner, reason });
    this.phase = "over";
    this.sendSnaps();
    this.broadcast();
  }

  setConfig(c: Client, cfg: Partial<MatchConfig>): string | null {
    if (c.id !== this.host) return "only the host can change the rules";
    if (this.phase !== "lobby") return "rules are locked once the countdown starts";
    this.config = sanitizeConfig(this.db, { ...this.config, ...cfg, seed: this.config.seed });
    for (const p of this.players) {
      if (p.bot) continue;
      if (p.loadout && this.config.shipPool.length && !this.config.shipPool.includes(p.loadout.ship))
        p.loadout = baseLoadout(this.db, this.config.shipPool[0]);
      p.priced = p.loadout ? priceLoadout(this.db, p.loadout, this.config.scrap, this.config.shipPool, this.config.unlimited) : null;
      p.ready = false;
    }
    this.rebuildBot();
    this.broadcast();
    return null;
  }

  setLoadout(c: Client, l: Loadout): string | null {
    if (this.phase !== "lobby") return "loadouts are locked";
    const p = this.players.find((q) => q.id === c.id);
    if (!p) return "not in this lobby";
    if (!this.db.ships[l.ship]) return "unknown ship";
    p.loadout = l;
    p.priced = priceLoadout(this.db, l, this.config.scrap, this.config.shipPool, this.config.unlimited);
    p.ready = false;
    this.broadcast();
    return null;
  }

  setReady(c: Client, ready: boolean): string | null {
    const p = this.players.find((q) => q.id === c.id);
    if (!p || this.phase !== "lobby") return "can't ready now";
    if (ready && !p.priced?.ok) return p.priced?.errors.join("; ") || "loadout invalid";
    p.ready = ready;
    if (this.players.length === 2 && this.players.every((q) => q.ready)) {
      this.phase = "countdown";
      this.countdown = COUNTDOWN;
    }
    this.broadcast();
    return null;
  }

  command(c: Client, cmd: Command): void {
    if (!this.match || this.phase !== "battle") return;
    const idx = this.players.findIndex((p) => p.id === c.id);
    if (idx === 0 || idx === 1) this.match.push(idx, cmd);
  }

  rematch(c: Client): void {
    if (this.phase !== "over") return;
    if (!this.players.some((p) => p.id === c.id)) return;
    this.phase = "lobby";
    this.match = null;
    this.config = { ...this.config, seed: (Math.random() * 2 ** 31) | 0 };
    for (const p of this.players) p.ready = p.bot ?? false;
    this.speed = 1;
    this.rebuildBot();
    this.broadcast();
  }

  /** Called once per second while counting down. */
  secondTick(): void {
    if (this.phase !== "countdown") return;
    this.countdown--;
    if (this.countdown <= 0) this.start();
    this.broadcast();
  }

  private start(): void {
    const [a, b] = this.players;
    if (this.phase !== "battle" || !this.loadouts) this.loadouts = [a.loadout!, b.loadout!];
    this.match = new Match(this.db, this.config, this.loadouts, [a.name, b.name]);
    const pc = this.practiceCfg;
    this.bot = pc ? new Bot(difficultyToBot(pc.difficulty).level, this.config.seed) : null;
    if (this.autopilot) this.autopilot = new Bot(this.autopilot.level, 99);
    this.speedAcc = 0;
    this.phase = "battle";
    this.pending = [[], []];
    this.players.forEach((p, i) => this.clients.get(p.id)?.send({ t: "start", you: i as 0 | 1 }));
    this.sendSnaps();
  }

  /** Called at 30 Hz; runs 0..n sim steps depending on the debug speed. */
  tick(): void {
    const m = this.match;
    if (!m || this.phase !== "battle") return;
    this.speedAcc += this.speed;
    let ran = 0;
    while (this.speedAcc >= 1 && this.phase === "battle") {
      this.speedAcc -= 1;
      this.stepOnce();
      ran++;
    }
    // Snapshots follow wall time (15 Hz), whatever the sim speed.
    if (ran > 0 && this.phase === "battle" && ++this.wallTicks % SNAP_EVERY === 0) this.sendSnaps();
  }

  private stepOnce(): void {
    const m = this.match;
    if (!m || this.phase !== "battle") return;
    this.players.forEach((p, i) => {
      const idx = i as 0 | 1;
      if (p.bot && this.bot) for (const c of this.bot.think(m, idx)) m.push(idx, c);
      else if (!p.bot && this.autopilot) for (const c of this.autopilot.think(m, idx)) m.push(idx, c);
    });
    m.step();
    if (m.state.events.length) {
      this.pending[0].push(...m.state.events);
      this.pending[1].push(...m.state.events);
    }
    if (m.over) {
      this.phase = "over";
      this.sendSnaps();
      this.broadcast();
    }
  }

  private debugInfo(idx: 0 | 1): DebugInfo | undefined {
    const pc = this.practiceCfg;
    if (!pc?.debug || !this.match) return undefined;
    const b = difficultyToBot(pc.difficulty);
    return {
      speed: this.speed, reveal: this.reveal, god: this.match.god.has(idx), autopilot: !!this.autopilot,
      difficulty: pc.difficulty, botLevel: b.level, scrapBonus: b.scrapBonus, botLog: this.bot?.log.slice(-14) ?? [],
      autopilotLog: this.autopilot?.log.slice(-8) ?? [], tick: this.match.state.tick,
    };
  }

  private sendSnaps(): void {
    const m = this.match;
    if (!m) return;
    this.players.forEach((p, i) => {
      const c = this.clients.get(p.id);
      const idx = i as 0 | 1;
      const view = viewFor(m, idx, this.pending[idx], this.reveal && !!this.practiceCfg?.debug);
      // Strip events the viewer must not learn about (enemy interior hazards without sensors).
      if (!view.ships[1 - idx].interior) {
        view.events = view.events.filter((e) => !(("ship" in e) && e.ship === 1 - idx && (e.e === "fireStart" || e.e === "breach" || e.e === "death")));
      }
      c?.send({ t: "snap", view, debug: this.debugInfo(idx) });
      this.pending[idx] = [];
    });
  }
}

export function sanitizeConfig(db: GameDB, c: MatchConfig): MatchConfig {
  return {
    winCondition: c.winCondition === "crew" ? "crew" : "hull",
    scrap: clamp(Math.round(Number(c.scrap) || 0), 0, 5000),
    shipPool: (Array.isArray(c.shipPool) ? c.shipPool : []).filter((s) => db.hangar.includes(s)),
    timeLimit: clamp(Math.round(Number(c.timeLimit) || 0), 0, 3600),
    seed: Number(c.seed) | 0,
    unlimited: !!c.unlimited,
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export { PROTOCOL_VERSION };
