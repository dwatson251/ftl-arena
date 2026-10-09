/** Lobbies: two seats, host-set rules, hangar validation, then an authoritative match at 30 Hz. */
import type { GameDB } from "@ftl/data";
import { PROTOCOL_VERSION, SNAP_EVERY, type LobbyPlayer, type LobbyState, type ServerMsg } from "@ftl/protocol";
import {
  baseLoadout, botCommands, DEFAULT_CONFIG, Match, priceLoadout, viewFor, type Command, type Loadout, type MatchConfig,
  type MatchEvent,
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

  constructor(public code: string, public host: string, public db: GameDB, cfg: Partial<MatchConfig>, public practice: boolean) {
    this.config = sanitizeConfig(db, { ...DEFAULT_CONFIG, seed: (Math.random() * 2 ** 31) | 0, ...cfg });
  }

  state(): LobbyState {
    return { code: this.code, host: this.host, phase: this.phase, config: this.config, players: this.players, countdown: this.countdown };
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
    this.players.push({ id: c.id, name: c.name, ready: false, loadout, priced: priceLoadout(this.db, loadout, this.config.scrap, this.config.shipPool), connected: true });
    this.clients.set(c.id, c);
    c.lobby = this;
    if (this.practice && this.players.length === 1) this.addBot();
    this.broadcast();
    return null;
  }

  private addBot(): void {
    const ship = this.config.shipPool[0] ?? this.db.hangar[0];
    const loadout = baseLoadout(this.db, ship);
    this.players.push({ id: "bot", name: "Practice bot", ready: true, loadout, priced: priceLoadout(this.db, loadout, this.config.scrap), connected: true, bot: true });
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
      p.priced = p.loadout ? priceLoadout(this.db, p.loadout, this.config.scrap, this.config.shipPool) : null;
      p.ready = false;
    }
    this.broadcast();
    return null;
  }

  setLoadout(c: Client, l: Loadout): string | null {
    if (this.phase !== "lobby") return "loadouts are locked";
    const p = this.players.find((q) => q.id === c.id);
    if (!p) return "not in this lobby";
    if (!this.db.ships[l.ship]) return "unknown ship";
    p.loadout = l;
    p.priced = priceLoadout(this.db, l, this.config.scrap, this.config.shipPool);
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
    this.match = new Match(this.db, this.config, [a.loadout!, b.loadout!], [a.name, b.name]);
    this.phase = "battle";
    this.pending = [[], []];
    this.players.forEach((p, i) => this.clients.get(p.id)?.send({ t: "start", you: i as 0 | 1 }));
    this.sendSnaps();
  }

  /** One simulation tick. */
  tick(): void {
    const m = this.match;
    if (!m || this.phase !== "battle") return;
    this.players.forEach((p, i) => {
      if (p.bot) for (const c of botCommands(m, i as 0 | 1)) m.push(i as 0 | 1, c);
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
    } else if (m.state.tick % SNAP_EVERY === 0) this.sendSnaps();
  }

  private sendSnaps(): void {
    const m = this.match;
    if (!m) return;
    this.players.forEach((p, i) => {
      const c = this.clients.get(p.id);
      const idx = i as 0 | 1;
      const view = viewFor(m, idx, this.pending[idx]);
      // Strip events the viewer must not learn about (enemy interior hazards without sensors).
      if (!view.ships[1 - idx].interior) {
        view.events = view.events.filter((e) => !(("ship" in e) && e.ship === 1 - idx && (e.e === "fireStart" || e.e === "breach" || e.e === "death")));
      }
      c?.send({ t: "snap", view });
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
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export { PROTOCOL_VERSION };
