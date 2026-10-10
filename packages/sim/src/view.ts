/**
 * What one player is allowed to see. The server sends only this, so hidden information never reaches the
 * other browser. FTL's sensor levels: 1 = own interior, 2 = enemy interior (crew, fires, O2), 3 = enemy
 * weapon charge and power. With no working sensors you only see rooms your own crew stand in.
 */
import { geometry } from "./geometry.ts";
import type { Match } from "./match.ts";
import type { MatchEvent, MatchState, Projectile, ShipState } from "./state.ts";
import { raceOf } from "./rules.ts";

export interface ShipView extends ShipState {
  /** Room ids the viewer can see inside; null = all. */
  visibleRooms: number[] | null;
  /** False when interior detail (crew, hazards, O2) was stripped. */
  interior: boolean;
  /** False when weapon charge and system power were stripped. */
  weaponsKnown: boolean;
}

export interface MatchView {
  you: 0 | 1;
  tick: number;
  config: MatchState["config"];
  ships: [ShipView, ShipView];
  projectiles: Projectile[];
  events: MatchEvent[];
  winner: MatchState["winner"];
  endReason: string;
}

export function viewFor(m: Match, you: 0 | 1, events: MatchEvent[] = m.state.events, reveal = false): MatchView {
  const st = m.state;
  const own = st.ships[you];
  const enemy = st.ships[1 - you];
  const sensors = m.eff(own.systems.sensors);
  const over = st.winner !== null || reveal;
  const telepath = own.crew.some((c) => !c.dead && raceOf(c.race).telepathic) || (own.augments ?? []).includes("LIFE_SCANNER");

  const ownView: ShipView = { ...structuredClone(own), visibleRooms: null, interior: true, weaponsKnown: true };
  if (sensors <= 0 && !over) {
    const g = geometry(m.db.layouts[own.layout]);
    ownView.visibleRooms = [...new Set(own.crew.filter((c) => !c.dead).map((c) => g.tiles.get(c.tile)!.room))];
  }

  const ev = structuredClone(enemy) as ShipView;
  ev.visibleRooms = null;
  ev.interior = over || sensors >= 2;
  ev.weaponsKnown = over || sensors >= 3;
  if (!ev.interior) {
    if (!telepath) ev.crew = [];
    ev.visibleRooms = [];
    for (const r of ev.rooms) {
      r.o2 = -1;
      r.fires = {};
      r.breaches = {};
    }
  }
  if (!ev.weaponsKnown) {
    for (const w of ev.weapons) {
      w.charge = -1;
      w.volleys = 0;
      w.powered = false;
    }
    for (const s of Object.values(ev.systems)) if (s) s.power = -1;
    ev.reactor = -1;
  }
  for (const w of ev.weapons) {
    w.target = null;
    w.autofire = false;
  }
  if (!over) {
    // The enemy's evasion is never shown (a later hacking drone on its helm/engines would reveal it), and
    // its hull only with level-3 sensors.
    ev.evasion = -1;
    if (!ev.weaponsKnown) ev.hull = -1;
  }
  return {
    you, tick: st.tick, config: st.config, ships: you === 0 ? [ownView, ev] : [ev, ownView],
    projectiles: st.projectiles, events, winner: st.winner, endReason: st.endReason,
  };
}
