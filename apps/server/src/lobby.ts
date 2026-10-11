/** Lobbies: two seats, host-set rules, hangar validation, then an authoritative match at 30 Hz. */
import type { GameDB, WeaponBP } from "@ftl/data";
import {
  PROTOCOL_VERSION, SNAP_EVERY, type DebugInfo, type DebugOp, type LobbyPlayer, type LobbyState, type PracticeConfig, type ServerMsg,
  type SurvivalState,
} from "@ftl/protocol";
import {
  applyCard, baseLoadout, Bot, type Assist, botLoadout, carryOver, DEFAULT_CONFIG, difficultyToBot, drawCards, enemyLoadout, Match, newRun, nextEnemy,
  priceLoadout, registerWeapons, RULES, score, stockLoadout, SURVIVAL, TICK_HZ, viewFor, type Card, type Command, type Loadout, type MatchConfig,
  type MatchEvent, type SurvivalEnemy, type SurvivalRun, PRICING,
} from "@ftl/sim";

/** Release bundles (the desktop app's server, the dedicated server) are built with __RELEASE__ set: no debug
 *  tools there. Run from source (`npm run dev`, tests), they're on. */
declare const __RELEASE__: boolean | undefined;
export const DEBUG_TOOLS = typeof __RELEASE__ === "undefined" || !__RELEASE__;

export interface Client {
  id: string;
  name: string;
  send(m: ServerMsg): void;
  lobby: Lobby | null;
  /** Connected from this machine (the hosting player's own window, when the server runs inside their app). */
  local?: boolean;
  /** Plays with a controller (experimental). */
  controller?: boolean;
}

const COUNTDOWN = 5;
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
  /** Survival: the run, this battle's opponent, the cards on offer, the aftermath clock, the jump timer. */
  run: SurvivalRun | null = null;
  private enemy: SurvivalEnemy | null = null;
  private offer: Card[] | null = null;
  private aftermathLeft = 0;
  private aftermathTotal = 0;
  private aftermathBoarders = false;
  private jumpTimer: ReturnType<typeof setTimeout> | null = null;
  private upgraded: Record<string, WeaponBP> = {};
  /** Controller players' assistants (by seat): the bot that runs their crew and reactor, and what's theirs. */
  private assists = new Map<number, { bot: Bot; a: Assist }>();

  constructor(public code: string, public host: string, public db: GameDB, cfg: Partial<MatchConfig>, public practice: boolean, private log: (s: string) => void = () => {}) {
    // Practice pauses freely, as FTL's single player does (an unlimited pause clock).
    const pauseDefaults: Partial<MatchConfig> = practice ? { pause: "clock", pauseBank: 0 } : {};
    this.config = sanitizeConfig(db, { ...DEFAULT_CONFIG, seed: (Math.random() * 2 ** 31) | 0, ...pauseDefaults, ...cfg }, practice);
    if (practice) this.practiceCfg = { difficulty: 40, botShip: "", debug: DEBUG_TOOLS };
  }

  state(): LobbyState {
    return {
      code: this.code, host: this.host, phase: this.phase, config: this.config, players: this.players, countdown: this.countdown,
      practice: this.practiceCfg, survival: this.config.survival ? this.survivalState() : null,
    };
  }

  private survivalState(): SurvivalState {
    const r = this.run;
    return {
      battle: r?.battle ?? 1, won: r?.won ?? 0, bosses: r?.bosses ?? 0, minis: r?.minis ?? 0, rerolls: r?.rerolls ?? SURVIVAL.rerolls, options: r?.options ?? SURVIVAL.options.start, score: r ? score(r) : 0, boss: !!this.enemy?.boss, mini: !!this.enemy?.mini,
      hazard: this.enemy?.hazard ?? "none", aftermathLeft: Math.max(0, Math.ceil(this.aftermathLeft)), aftermathTotal: this.aftermathTotal || SURVIVAL.aftermath,
      boarders: this.aftermathBoarders, offer: this.offer,
      picks: r?.picks ?? [], rare: r?.rare ?? 0, over: !!r?.over, weapons: this.upgraded,
    };
  }

  /** A player switched controller play on or off (shown in the lobby; their crew and reactor go to the AI). */
  setController(c: Client, on: boolean): void {
    const p = this.players.find((q) => q.id === c.id);
    if (!p || !!p.controller === on) return;
    p.controller = on;
    if (!on) this.assists.delete(this.players.indexOf(p));
    this.broadcast();
  }

  /** Controller play: take crew from the AI (headed for the teleporter) or hand them back. */
  controlCrew(c: Client, crew: number[], on: boolean): void {
    const idx = this.players.findIndex((q) => q.id === c.id);
    const as = this.assistFor(idx);
    if (!as) return;
    for (const id of crew.slice(0, 16)) on ? as.a.claimedCrew.add(Number(id)) : as.a.claimedCrew.delete(Number(id));
  }

  /** The assistant for a controller player's seat (made on first use; none for anyone else). */
  private assistFor(idx: number): { bot: Bot; a: Assist } | null {
    const p = this.players[idx];
    if (!p?.controller || p.bot) return null;
    let as = this.assists.get(idx);
    if (!as) {
      as = { bot: new Bot(1, 4242 + idx), a: { ownedWeapons: new Set(), ownedSystems: new Set(), claimedCrew: new Set() } };
      this.assists.set(idx, as);
    }
    return as;
  }

  /** Between a Survival run's battles (the run lives on through a reload). */
  midRun(): boolean {
    return this.phase === "aftermath" || this.phase === "reward" || this.phase === "jump";
  }

  /** The human seat (Survival is single player: the other seat is the bot). */
  private humanIdx(): 0 | 1 {
    return this.players.findIndex((p) => !p.bot) === 1 ? 1 : 0;
  }

  /** Survival: spend a re-roll for a fresh hand. */
  reroll(c: Client): string | null {
    if (!this.run || this.phase !== "reward" || !this.offer) return "nothing to re-roll";
    if (this.players[this.humanIdx()]?.id !== c.id) return "not your run";
    if ((this.run.rerolls ?? 0) <= 0) return "no re-rolls left";
    this.run.rerolls = (this.run.rerolls ?? 0) - 1;
    this.offer = drawCards(this.db, this.run, (Math.random() * 2 ** 31) | 0);
    this.broadcast();
    return null;
  }

  /** Survival: take one of the cards on offer, then jump to the next battle. */
  pick(c: Client, i: number): string | null {
    if (!this.run || this.phase !== "reward" || !this.offer) return "nothing to pick";
    if (this.players[this.humanIdx()]?.id !== c.id) return "not your run";
    const card = this.offer[Math.floor(Number(i))];
    if (!card) return "no such card";
    applyCard(this.db, this.run, card);
    Object.assign(this.upgraded, registerWeapons(this.db, this.run.loadout.weapons));
    this.log(`survival: took ${card.title} after battle ${this.run.battle}`);
    this.offer = null;
    this.run.battle++;
    this.phase = "jump";
    if (this.jumpTimer) clearTimeout(this.jumpTimer);
    this.jumpTimer = setTimeout(() => {
      this.jumpTimer = null;
      if (this.phase !== "jump" || !this.clients.size) return;
      this.config = { ...this.config, seed: (Math.random() * 2 ** 31) | 0 };
      this.start();
      this.broadcast();
    }, SURVIVAL.jump * 1000);
    this.broadcast();
    return null;
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
    if (this.players.length >= 2) return "that match is full";
    // A finished match with a free seat (the other captain left): back to the hangar for a new one.
    if (this.phase === "over") this.rematchReset();
    if (this.phase !== "lobby") return "that match has already started";
    const ship = this.config.shipPool[0] ?? this.db.hangar[0];
    const loadout = baseLoadout(this.db, ship);
    this.players.push({ id: c.id, name: c.name, ready: false, loadout, priced: this.price(loadout), connected: true, controller: !!c.controller });
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
      // A random enemy is an ordinary single-player ship; the flagship is picked on purpose.
      const ordinary = this.db.enemies.filter((e) => !/^BOSS_/.test(e));
      const pick = pc.botShip === "@enemy" ? ordinary[seed % ordinary.length] : pc.botShip;
      // Above 70 difficulty the flagship flies Hard mode's layout (corridors to its laser and missile rooms).
      const ship = pc.difficulty > 70 && this.db.ships[`${pick}_HARD`] ? `${pick}_HARD` : pick;
      p.loadout = enemyLoadout(this.db, ship, level, seed, Math.round(level * 6 + scrapBonus * 14), Math.round(this.config.scrap * (1 + scrapBonus)));
      p.priced = { ok: true, total: 0, lines: [], errors: [] };
    } else {
      const ship = pc.botShip && pool.includes(pc.botShip) ? pc.botShip : pool[seed % pool.length];
      const scrap = Math.round(this.config.scrap * (1 + scrapBonus));
      p.loadout = botLoadout(this.db, ship, scrap, level, this.config.seed, this.rules());
      p.priced = priceLoadout(this.db, p.loadout, scrap, [], false, false, this.rules());
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
    if (cfg.debug !== undefined) next.debug = DEBUG_TOOLS && !!cfg.debug;
    this.practiceCfg = next;
    if (this.phase === "lobby") this.rebuildBot();
    else if (this.bot) this.bot.setLevel(difficultyToBot(next.difficulty).level);
    this.broadcast();
    return null;
  }

  debug(c: Client, d: DebugOp): string | null {
    if (!DEBUG_TOOLS || !this.practiceCfg?.debug) return "debug tools are off";
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
        if (m) {
          const s = m.state.ships[d.ship];
          const v = d.delta !== undefined ? s.hull + d.delta : (d.value ?? s.hull);
          s.hull = Math.max(0, Math.min(s.maxHull, Math.round(v)));
        }
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
      case "breach":
        if (m) {
          // A breach in a random room that doesn't have one yet (one per room, as in the sim).
          const s = m.state.ships[d.ship];
          const free = s.rooms.filter((r) => !Object.keys(r.breaches).length);
          const r = free[(Math.random() * free.length) | 0];
          if (r) r.breaches[m.geo(s).roomTiles.get(r.id)![0]] = 100;
        }
        break;
      case "hurt":
        if (m) for (const c of m.state.ships[d.ship].crew) if (!c.dead && c.dying === undefined) c.hp -= 45;
        break;
      case "missiles":
        if (m) m.state.ships[d.ship].missiles += 5;
        break;
      case "parts":
        if (m) {
          const s = m.state.ships[d.ship];
          s.droneParts = (s.droneParts ?? 0) + 5;
        }
        break;
      case "fixall":
        if (m) {
          // Every system whole again: no damage, ion or repair in progress, and every recharge done.
          const s = m.state.ships[d.ship];
          for (const x of Object.values(s.systems)) if (x) Object.assign(x, { damage: 0, repair: 0, ion: 0, ionTimer: 0, fireDmg: 0 });
          s.tele = 99;
          if (s.cloak) s.cloak.cd = 0;
          if (s.hack) s.hack.cd = 0;
          if (s.battery) s.battery.cd = 0;
          s.mindCd = 0;
          for (const dr of s.drones ?? []) dr.rebuild = 0;
        }
        break;
      case "kill": {
        // One of that player's crew dies (for clone bay checks).
        const c = m?.crewOf(d.ship).find((q) => !q.dead && q.dying === undefined);
        if (c) c.hp = 0;
        break;
      }
      case "restart":
        if (this.loadouts) this.start();
        break;
      case "boarder":
        if (m) {
          // One of the other side's crew (or a human) beamed into a random room of this ship.
          const s = m.state.ships[d.ship];
          const from = m.state.ships[1 - d.ship];
          const g = m.geo(s);
          const tiles = [...g.tiles.keys()];
          const tile = tiles[(Math.random() * tiles.length) | 0];
          const [x, y] = tile.split(",").map(Number);
          const proto = from.crew.find((c) => c.owner === from.idx && c.drone === undefined);
          const id = 700 + s.crew.length;
          s.crew.push({
            ...(proto ? structuredClone(proto) : structuredClone(s.crew[0])), id, owner: (1 - d.ship) as 0 | 1, tile, home: tile, x, y, path: [], task: "idle",
            dead: false, dying: undefined, stun: 0, hp: 100, maxHp: 100, mind: undefined,
          });
        }
        break;
      case "skipAftermath":
        if (this.phase === "aftermath") this.aftermathLeft = 0;
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
    if ((this.phase === "battle" || this.midRun()) && !hard) {
      // Disconnected mid-battle: hold the seat for a grace period, then forfeit.
      p.connected = false;
      this.dropTimers.set(c.id, setTimeout(() => {
        this.forfeit(p.id, `${p.name} disconnected: victory by forfeit`);
        this.drop(p);
        this.broadcast();
      }, GRACE_MS));
    } else {
      // Left for good (or between battles): free the seat, and the other captain takes over as host.
      if (this.phase === "battle") this.forfeit(p.id, `${p.name} left the battle: victory by forfeit`);
      this.drop(p);
    }
    this.broadcast();
  }

  /** Remove a player's seat; the remaining captain becomes host and nobody stays ready. */
  private drop(p: LobbyPlayer): void {
    this.players = this.players.filter((q) => q !== p);
    this.clients.delete(p.id);
    if (this.host === p.id && this.players.some((q) => !q.bot)) this.host = this.players.find((q) => !q.bot)!.id;
    for (const q of this.players) q.ready = q.bot ?? false;
    if (this.phase === "countdown") this.phase = "lobby";
    this.log(`${p.name} left${this.players.length ? `; ${this.players.find((q) => q.id === this.host)?.name ?? "?"} is host` : ""}`);
  }

  /**
   * The server is shutting down mid-battle. When it lives in the host's app, the host is the one whose
   * window is on this machine: they forfeit to the other captain. Otherwise (a dedicated server going down,
   * or nobody to blame) it's a draw.
   */
  shutdown(): void {
    if (this.phase !== "battle" || !this.match || this.match.over) return;
    const locals = this.players.filter((p) => !p.bot && this.clients.get(p.id)?.local);
    if (locals.length === 1) this.forfeit(locals[0].id, `${locals[0].name} closed the game: victory by forfeit`);
    else {
      const st = this.match.state;
      st.winner = -1;
      st.endReason = "the server shut down";
      for (const q of this.pending) q.push({ e: "end", winner: -1, reason: st.endReason });
      this.phase = "over";
      this.sendSnaps();
      this.broadcast();
    }
  }

  /** Does this session hold a seat here (so a reconnect goes straight back in)? */
  seated(id: string): boolean {
    return this.players.some((p) => p.id === id && !p.bot);
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

  /** Price a build under the rules ("Bring your own ship" has no scrap allowance). */
  private price(l: Loadout) {
    return priceLoadout(this.db, l, this.config.ftlOnly || this.config.survival ? Number.MAX_SAFE_INTEGER : this.config.scrap, this.config.shipPool, this.config.unlimited, this.config.winCondition === "auto", this.rules());
  }

  /** The pricing rules in force (Scrap costs, unobtainable items). */
  private rules() {
    return { costs: this.config.costs ?? "none", unobtainable: this.config.unobtainable !== false };
  }

  setConfig(c: Client, cfg: Partial<MatchConfig>): string | null {
    if (c.id !== this.host) return "only the host can change the rules";
    if (this.phase !== "lobby") return "rules are locked once the countdown starts";
    const wasFtl = !!this.config.ftlOnly;
    const wasCosts = this.config.costs ?? "none";
    this.config = sanitizeConfig(this.db, { ...this.config, ...cfg, seed: this.config.seed }, this.practice);
    // Hulls costing scrap: start the allowance where a ship and some upgrades fit.
    if (wasCosts === "none" && this.config.costs !== "none" && this.config.scrap < PRICING.shipsBudget) this.config = { ...this.config, scrap: PRICING.shipsBudget };
    for (const p of this.players) {
      if (p.bot) continue;
      if (p.loadout && this.config.shipPool.length && !this.config.shipPool.includes(p.loadout.ship))
        p.loadout = baseLoadout(this.db, this.config.shipPool[0]);
      // Switching to "Bring your own ship": everyone else's hangar build is cleared (they bring theirs).
      if (this.config.ftlOnly && !wasFtl && p.id !== this.host && p.loadout?.origin !== "ftl") p.loadout = baseLoadout(this.db, this.config.shipPool[0] ?? this.db.hangar[0]);
      // Survival flies the stock ship.
      if (this.config.survival && p.loadout) p.loadout = stockLoadout(this.db, p.loadout.ship);
      p.priced = p.loadout ? this.price(p.loadout) : null;
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
    // Survival flies the stock ship: only the hull is a choice.
    if (this.config.survival && !p.bot) l = stockLoadout(this.db, l.ship);
    p.loadout = l;
    p.priced = this.price(l);
    p.ready = false;
    this.broadcast();
    return null;
  }

  setReady(c: Client, ready: boolean): string | null {
    const p = this.players.find((q) => q.id === c.id);
    // Unready also works during the countdown: it calls the launch off.
    const calling = !ready && this.phase === "countdown";
    if (!p || (this.phase !== "lobby" && !calling)) return "can't ready now";
    if (ready && !p.priced?.ok) return p.priced?.errors.join("; ") || "loadout invalid";
    if (ready && this.config.ftlOnly && !p.bot && p.loadout?.origin !== "ftl") return "this lobby flies ships from FTL saves only: load yours on the Presets step";
    p.ready = ready;
    if (calling) {
      this.phase = "lobby";
      this.countdown = 0;
    }
    if (this.players.length === 2 && this.players.every((q) => q.ready)) {
      this.phase = "countdown";
      this.countdown = COUNTDOWN;
    }
    this.broadcast();
    return null;
  }

  command(c: Client, cmd: Command): void {
    if (!this.match || (this.phase !== "battle" && this.phase !== "aftermath")) return;
    const idx = this.players.findIndex((p) => p.id === c.id);
    if (idx !== 0 && idx !== 1) return;
    // Controller play: whatever the player touches is theirs from then on (the assistant leaves it alone).
    const as = this.assistFor(idx);
    if (as) {
      if ((cmd.c === "weaponPower" || cmd.c === "target") && Number.isInteger(cmd.slot)) as.a.ownedWeapons.add(cmd.slot);
      if (cmd.c === "power") {
        as.a.ownedSystems.add(cmd.system);
        // The teleporter powered down: whoever the player had claimed goes back to the AI.
        if (cmd.system === "teleporter" && cmd.delta < 0) as.a.claimedCrew.clear();
      }
    }
    this.match.push(idx, cmd);
  }

  rematch(c: Client): void {
    if (this.phase !== "over") return;
    if (!this.players.some((p) => p.id === c.id)) return;
    this.rematchReset();
  }

  private rematchReset(): void {
    this.phase = "lobby";
    this.match = null;
    // Survival: a new run (from the hangar).
    this.run = null;
    this.enemy = null;
    this.offer = null;
    this.upgraded = {};
    if (this.jumpTimer) clearTimeout(this.jumpTimer);
    this.jumpTimer = null;
    this.config = { ...this.config, seed: (Math.random() * 2 ** 31) | 0 };
    for (const p of this.players) p.ready = p.bot ?? false;
    this.speed = 1;
    this.rebuildBot();
    this.broadcast();
  }

  /** Called once per second while counting down. */
  secondTick(): void {
    // The aftermath countdown goes out once a second.
    if (this.phase === "aftermath") this.broadcast();
    if (this.phase !== "countdown") return;
    this.countdown--;
    if (this.countdown <= 0) this.start();
    this.broadcast();
  }

  private start(): void {
    const [a, b] = this.players;
    if (this.config.survival) return this.startSurvival();
    if (this.phase !== "battle" || !this.loadouts) this.loadouts = [a.loadout!, b.loadout!];
    this.match = new Match(this.db, this.config, this.loadouts, [a.name, b.name]);
    const pc = this.practiceCfg;
    this.bot = pc ? new Bot(difficultyToBot(pc.difficulty).level, this.config.seed) : null;
    if (this.autopilot) this.autopilot = new Bot(this.autopilot.level, 99);
    this.speedAcc = 0;
    // A new battle: nothing is the controller player's until they touch it again.
    this.assists.clear();
    this.phase = "battle";
    this.pending = [[], []];
    this.players.forEach((p, i) => this.clients.get(p.id)?.send({ t: "start", you: i as 0 | 1 }));
    this.log(`battle: ${a.name} (${a.loadout?.ship}) vs ${b.name} (${b.loadout?.ship})`);
    this.sendSnaps();
  }

  /** Survival: the next battle of the run (the first one starts it), against a fresh random opponent. */
  private startSurvival(): void {
    const h = this.humanIdx();
    const me = this.players[h];
    const foe = this.players[1 - h];
    this.run ??= newRun(this.db, me.loadout!.ship);
    const run = this.run;
    Object.assign(this.upgraded, registerWeapons(this.db, run.loadout.weapons));
    this.enemy = nextEnemy(this.db, run.battle, Math.abs(this.config.seed));
    foe.loadout = this.enemy.loadout;
    foe.name = this.enemy.boss ? "Rebel Flagship" : this.enemy.mini ? `Rival captain (${this.enemy.difficulty})` : `Enemy (${this.enemy.difficulty})`;
    const cfg: MatchConfig = { ...this.config, hazard: this.enemy.hazard, winCondition: "hull" };
    const ls: [Loadout, Loadout] = h === 0 ? [run.loadout, this.enemy.loadout] : [this.enemy.loadout, run.loadout];
    this.loadouts = ls;
    this.match = new Match(this.db, cfg, ls, [this.players[0].name, this.players[1].name]);
    this.bot = new Bot(difficultyToBot(this.enemy.difficulty).level, this.config.seed);
    if (this.autopilot) this.autopilot = new Bot(this.autopilot.level, 99);
    this.speedAcc = 0;
    // A new battle: nothing is the controller player's until they touch it again.
    this.assists.clear();
    this.aftermathLeft = this.aftermathTotal = 0;
    this.aftermathBoarders = false;
    this.offer = null;
    this.phase = "battle";
    this.pending = [[], []];
    this.players.forEach((p, i) => this.clients.get(p.id)?.send({ t: "start", you: i as 0 | 1 }));
    this.log(`survival battle ${run.battle}: ${me.name} (${run.loadout.ship}) vs ${foe.name} (${this.enemy.loadout.ship})${this.enemy.hazard !== "none" ? ` in ${this.enemy.hazard}` : ""}`);
    this.sendSnaps();
  }

  /** Survival's aftermath: one tick of the winner's own ship; then the cards. */
  private aftermathOnce(): void {
    const m = this.match;
    if (!m || !this.run) return;
    const h = this.humanIdx();
    if (this.autopilot) for (const c of this.autopilot.think(m, h)) m.push(h, c);
    else {
      const as = this.assistFor(h);
      if (as) for (const c of as.bot.think(m, h, as.a)) m.push(h, c);
    }
    const paused = m.aftermathStep(h);
    if (m.state.events.length) {
      this.pending[0].push(...m.state.events);
      this.pending[1].push(...m.state.events);
    }
    if (!paused) this.aftermathLeft -= 1 / TICK_HZ;
    // The boarders are dealt with: no need to wait out the long clock (down to the usual one, if it's longer).
    if (this.aftermathBoarders && !m.state.ships[h].crew.some((c) => c.owner !== h && !c.dead && c.dying === undefined)) {
      this.aftermathBoarders = false;
      this.aftermathLeft = Math.min(this.aftermathLeft, SURVIVAL.aftermath);
      this.broadcast();
    }
    if (this.aftermathLeft <= 0) this.toReward();
  }

  private toReward(): void {
    const m = this.match;
    if (!m || !this.run || this.phase !== "aftermath") return;
    carryOver(this.run, m.state.ships[this.humanIdx()]);
    this.offer = drawCards(this.db, this.run, Math.abs(this.config.seed) + this.run.battle * 7919);
    this.aftermathLeft = 0;
    this.phase = "reward";
    this.sendSnaps();
    this.broadcast();
  }

  /** Called at 30 Hz; runs 0..n sim steps depending on the debug speed. */
  tick(): void {
    const m = this.match;
    if (!m || (this.phase !== "battle" && this.phase !== "aftermath")) return;
    const ph = this.phase;
    this.speedAcc += this.speed;
    let ran = 0;
    while (this.speedAcc >= 1 && this.phase === ph) {
      this.speedAcc -= 1;
      if (ph === "battle") this.stepOnce();
      else this.aftermathOnce();
      ran++;
    }
    // Snapshots follow wall time (15 Hz), whatever the sim speed.
    if (ran > 0 && this.phase === ph && ++this.wallTicks % SNAP_EVERY === 0) this.sendSnaps();
  }

  private stepOnce(): void {
    const m = this.match;
    if (!m || this.phase !== "battle") return;
    this.players.forEach((p, i) => {
      const idx = i as 0 | 1;
      if (p.bot && this.bot) for (const c of this.bot.think(m, idx)) m.push(idx, c);
      // The bot plans nothing in a tactical timeout, so it's always ready to go on.
      if (p.bot && m.state.pause?.kind === "tactical" && !m.state.pause.ready?.[idx]) m.push(idx, { c: "pause", on: false });
      else if (!p.bot && this.autopilot) for (const c of this.autopilot.think(m, idx)) m.push(idx, c);
      else if (!p.bot) {
        // Controller play: the assistant runs this player's crew and reactor.
        const as = this.assistFor(idx);
        if (as) for (const c of as.bot.think(m, idx, as.a)) m.push(idx, c);
      }
    });
    m.step();
    if (m.state.events.length) {
      this.pending[0].push(...m.state.events);
      this.pending[1].push(...m.state.events);
    }
    if (m.over && this.config.survival && this.run) {
      const w = m.state.winner;
      if (w === this.humanIdx()) {
        // Won: the ship carries on a while (repairs, fires, boarders), then the cards.
        this.run.won++;
        if (this.enemy?.boss) this.run.bosses++;
        if (this.enemy?.mini) this.run.minis = (this.run.minis ?? 0) + 1;
        // Every boss or mini-boss beaten earns a re-roll.
        if (this.enemy?.boss || this.enemy?.mini) this.run.rerolls = (this.run.rerolls ?? SURVIVAL.rerolls) + 1;
        this.phase = "aftermath";
        // Enemy boarders still on our ship: a longer wait before the jump, to fight them off.
        const ship = m.state.ships[w];
        this.aftermathBoarders = ship.crew.some((c) => c.owner !== w && !c.dead && c.dying === undefined);
        this.aftermathTotal = this.aftermathBoarders ? SURVIVAL.aftermathBoarders : SURVIVAL.aftermath;
        this.aftermathLeft = this.aftermathTotal;
        this.log(`survival: won battle ${this.run.battle}`);
      } else {
        this.run.over = true;
        this.phase = "over";
        this.log(`survival: run over after ${this.run.won} wins (score ${score(this.run)})`);
      }
      this.sendSnaps();
      this.broadcast();
      return;
    }
    if (m.over) {
      this.phase = "over";
      const w = m.state.winner;
      this.log(`over: ${w === -1 ? "draw" : `${this.players[w ?? 0]?.name} won`} (${m.state.endReason})`);
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

export function sanitizeConfig(db: GameDB, c: MatchConfig, practice = false): MatchConfig {
  const pause = c.pause === "tactical" || c.pause === "clock" ? c.pause : "off";
  // An unlimited pause clock (0) is for practice only: against a person it would stop the game for good.
  const bank = clamp(Math.round(Number(c.pauseBank ?? RULES.pauseBank) || 0), 0, 600);
  const hazards = ["none", "sun", "pulsar", "asteroids", "nebula", "storm", "asb", "random"];
  return {
    hazard: hazards.includes(String(c.hazard)) ? c.hazard : "none",
    pause,
    tacticalEvery: clamp(Math.round(Number(c.tacticalEvery ?? RULES.tacticalEvery) || RULES.tacticalEvery), 15, 600),
    tacticalLength: clamp(Math.round(Number(c.tacticalLength ?? RULES.tacticalLength) || RULES.tacticalLength), 3, 60),
    pauseBank: bank === 0 && !practice ? RULES.pauseBank : bank,
    pauseRegen: clamp(Math.round(Number(c.pauseRegen ?? RULES.pauseRegen) || 0), 0, 60),
    // "auto" replaced the old kill-the-crew mode (an old "crew" setting means it too).
    winCondition: c.winCondition === "auto" || (c.winCondition as string) === "crew" ? "auto" : "hull",
    scrap: clamp(Math.round(Number(c.scrap) || 0), 0, 10000),
    shipPool: (Array.isArray(c.shipPool) ? c.shipPool : []).filter((s) => db.hangar.includes(s)),
    timeLimit: clamp(Math.round(Number(c.timeLimit) || 0), 0, 3600),
    seed: Number(c.seed) | 0,
    // Survival is single player: practice lobbies only, and it has no use for the build rules.
    unlimited: !!c.unlimited && !(practice && c.survival),
    ftlOnly: !!c.ftlOnly && !(practice && c.survival),
    survival: practice && !!c.survival,
    // Scrap costs are Arena's (none in Survival); a Tournament allows only what a normal run can give you.
    costs: practice && c.survival ? "none" : c.costs === "ships" || c.costs === "tournament" ? c.costs : "none",
    unobtainable: practice && c.survival ? true : c.costs === "tournament" ? false : c.unobtainable !== false,
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export { PROTOCOL_VERSION };
