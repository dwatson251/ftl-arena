/** Wire protocol between browser and server: JSON text frames over one WebSocket. */
import type { GameDB, WeaponBP } from "@ftl/data";
import type { Card, Command, Loadout, MatchConfig, MatchView, Priced } from "@ftl/sim";

export const PROTOCOL_VERSION = 1;
/** Server tick rate and snapshot rate (every SNAP_EVERY ticks). */
export const SNAP_EVERY = 2;

/** Survival adds three between battles: "aftermath" (the winner's ship carries on for a while), "reward"
 *  (sim paused, cards on offer) and "jump" (the FTL jump to the next battle). */
export type Phase = "lobby" | "countdown" | "battle" | "over" | "aftermath" | "reward" | "jump";

/** A Survival run as the player sees it. */
export interface SurvivalState {
  /** The battle being fought (or just won), from 1. */
  battle: number;
  won: number;
  bosses: number;
  score: number;
  boss: boolean;
  hazard: string;
  /** Seconds of aftermath left (while in "aftermath"). */
  aftermathLeft: number;
  /** How long this aftermath runs (longer with boarders aboard), for the FTL charge bars. */
  aftermathTotal: number;
  /** Enemy boarders were aboard when the enemy ship went. */
  boarders: boolean;
  /** The cards on offer (while in "reward"). */
  offer: Card[] | null;
  picks: string[];
  rare: number;
  /** The run ended: the ship was lost. */
  over: boolean;
  /** Upgraded guns in play: blueprints for the client's db. */
  weapons: Record<string, WeaponBP>;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  loadout: Loadout | null;
  priced: Priced | null;
  connected: boolean;
  bot?: boolean;
}

/** Practice-lobby settings for the bot and the debug tools. */
export interface PracticeConfig {
  /** 0-100, see difficultyToBot(). */
  difficulty: number;
  /** Bot hull; "" = random from the pool. */
  botShip: string;
  /** Debug tools in battle (speed, pause, reveal, god mode, autopilot, bot log). */
  debug: boolean;
}

export type DebugOp =
  | { op: "speed"; value: number }
  | { op: "step"; ticks: number }
  | { op: "reveal"; on: boolean }
  | { op: "god"; on: boolean }
  | { op: "autopilot"; on: boolean; level?: number }
  | { op: "difficulty"; value: number }
  | { op: "hull"; ship: 0 | 1; value?: number; delta?: number }
  | { op: "fire"; ship: 0 | 1 }
  | { op: "damage"; ship: 0 | 1 }
  | { op: "ion"; ship: 0 | 1 }
  | { op: "breach"; ship: 0 | 1 }
  | { op: "hurt"; ship: 0 | 1 }
  | { op: "kill"; ship: 0 | 1 }
  | { op: "missiles"; ship: 0 | 1 }
  | { op: "parts"; ship: 0 | 1 }
  | { op: "fixall"; ship: 0 | 1 }
  | { op: "restart" }
  | { op: "skipAftermath" };

export interface DebugInfo {
  speed: number;
  reveal: boolean;
  god: boolean;
  autopilot: boolean;
  difficulty: number;
  botLevel: number;
  scrapBonus: number;
  botLog: string[];
  autopilotLog: string[];
  tick: number;
}

export interface LobbyState {
  code: string;
  host: string;
  phase: Phase;
  config: MatchConfig;
  players: LobbyPlayer[];
  countdown: number;
  practice: PracticeConfig | null;
  survival?: SurvivalState | null;
}

export type ClientMsg =
  | { t: "hello"; v: number; name: string; token?: string }
  | { t: "create"; config?: Partial<MatchConfig>; practice?: boolean }
  | { t: "join"; code: string }
  | { t: "leave" }
  | { t: "config"; config: Partial<MatchConfig> }
  | { t: "loadout"; loadout: Loadout }
  | { t: "ready"; ready: boolean }
  | { t: "cmd"; cmd: Command }
  | { t: "practice"; practice: Partial<PracticeConfig> }
  | { t: "debug"; d: DebugOp }
  | { t: "rematch" }
  | { t: "pick"; card: number };

export type ServerMsg =
  | { t: "welcome"; v: number; token: string; db: GameDB }
  | { t: "lobby"; lobby: LobbyState | null }
  | { t: "start"; you: 0 | 1 }
  | { t: "snap"; view: MatchView; debug?: DebugInfo }
  | { t: "error"; msg: string };

export const encode = (m: ClientMsg | ServerMsg) => JSON.stringify(m);
export const decode = <T extends ClientMsg | ServerMsg>(s: string): T => JSON.parse(s) as T;
