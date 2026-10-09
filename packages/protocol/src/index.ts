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

export interface LobbyState {
  code: string;
  host: string;
  phase: Phase;
  config: MatchConfig;
  players: LobbyPlayer[];
  countdown: number;
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
  | { t: "rematch" };

export type ServerMsg =
  | { t: "welcome"; v: number; token: string; db: GameDB }
  | { t: "lobby"; lobby: LobbyState | null }
  | { t: "start"; you: 0 | 1 }
  | { t: "snap"; view: MatchView }
  | { t: "error"; msg: string };

export const encode = (m: ClientMsg | ServerMsg) => JSON.stringify(m);
export const decode = <T extends ClientMsg | ServerMsg>(s: string): T => JSON.parse(s) as T;
