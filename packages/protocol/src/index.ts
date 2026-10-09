/** Wire protocol between browser and server: JSON text frames over one WebSocket. */
import type { GameDB } from "@ftl/data";
import type { Command, Loadout, MatchConfig, MatchView, Priced } from "@ftl/sim";

export const PROTOCOL_VERSION = 1;
/** Server tick rate and snapshot rate (every SNAP_EVERY ticks). */
export const SNAP_EVERY = 2;

export type Phase = "lobby" | "countdown" | "battle" | "over";

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
  | { op: "hull"; ship: 0 | 1; value: number }
  | { op: "fire"; ship: 0 | 1 }
  | { op: "damage"; ship: 0 | 1 }
  | { op: "restart" };

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
  | { t: "rematch" };

export type ServerMsg =
  | { t: "welcome"; v: number; token: string; db: GameDB }
  | { t: "lobby"; lobby: LobbyState | null }
  | { t: "start"; you: 0 | 1 }
  | { t: "snap"; view: MatchView; debug?: DebugInfo }
  | { t: "error"; msg: string };

export const encode = (m: ClientMsg | ServerMsg) => JSON.stringify(m);
export const decode = <T extends ClientMsg | ServerMsg>(s: string): T => JSON.parse(s) as T;
