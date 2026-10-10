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
  /** Weapon charge is shown even without sensors: the viewer's hacking drone sits on the weapons room. */
  weaponChargeKnown?: boolean;
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
  pause: MatchState["pause"];
  pauseBank?: MatchState["pauseBank"];
  nextTactical?: number;
}

export function viewFor(m: Match, you: 0 | 1, events: MatchEvent[] = m.state.events, reveal = false): MatchView {
  const st = m.state;
  const own = st.ships[you];
  const enemy = st.ships[1 - you];
  const sensors = m.eff(own.systems.sensors);
  const over = st.winner !== null || reveal;
  const telepath = m.crewOf(you).some((c) => !c.dead && raceOf(c.race).telepathic) || (own.augments ?? []).includes("LIFE_SCANNER");

  const ownView: ShipView = { ...structuredClone(own), visibleRooms: null, interior: true, weaponsKnown: true };
  if (sensors <= 0 && !over) {
    const g = geometry(m.db.layouts[own.layout]);
    ownView.visibleRooms = [...new Set(own.crew.filter((c) => !c.dead && c.owner === you).map((c) => g.tiles.get(c.tile)?.room ?? -1))];
  }

  const ev = structuredClone(enemy) as ShipView;
  ev.visibleRooms = null;
  ev.interior = over || sensors >= 2;
  ev.weaponsKnown = over || sensors >= 3;
  if (!ev.interior) {
    // Without sensors you still see the rooms your boarders stand in, and everyone in them.
    const eg = geometry(m.db.layouts[enemy.layout]);
    const roomOf = (c: { tile: string }) => eg.tiles.get(c.tile)?.room ?? -1;
    const seen = new Set(ev.crew.filter((c) => c.owner === you && !c.dead).map(roomOf));
    // An attached hacking drone shows its room too.
    if (own.hack?.attached) seen.add(own.hack.room);
    // Telepathy (Slug crew, the life scanner) senses where the others are, nothing else: anonymous blips.
    ev.crew = ev.crew.flatMap((c) => {
      if (c.owner === you || seen.has(roomOf(c))) return [c];
      if (!telepath || c.dead || c.dying !== undefined) return [];
      return [{
        id: c.id, name: "", race: "", hp: 1, maxHp: 1, x: c.x, y: c.y, tile: c.tile, path: [], home: c.tile, task: "idle" as const,
        xp: { pilot: 0, engines: 0, shields: 0, weapons: 0, repair: 0, combat: 0 }, stun: 0, dead: false, blip: true, owner: c.owner,
      }];
    });
    ev.visibleRooms = [...seen];
    for (const r of ev.rooms) {
      if (seen.has(r.id)) continue;
      r.o2 = -1;
      r.fires = {};
      r.breaches = {};
    }
  }
  // A hacking drone on their weapons room reads the guns' charge (FTL shows a hacked room's full detail).
  ev.weaponChargeKnown = ev.weaponsKnown || (!!own.hack?.attached && own.hack.room === enemy.systems.weapons?.room);
  if (!ev.weaponChargeKnown) {
    for (const w of ev.weapons) {
      w.charge = -1;
      w.volleys = 0;
      w.powered = false;
    }
  }
  if (!ev.weaponsKnown) {
    for (const s of Object.values(ev.systems)) if (s) s.power = -1;
    ev.reactor = -1;
  }
  for (const w of ev.weapons) {
    w.target = null;
    w.autofire = false;
  }
  if (!over) {
    // The enemy's evasion is never shown; its hull always is, whatever your sensors.
    ev.evasion = -1;
  }
  return {
    you, tick: st.tick, config: st.config, ships: you === 0 ? [ownView, ev] : [ev, ownView],
    projectiles: st.projectiles, events, winner: st.winner, endReason: st.endReason,
    pause: st.pause ?? null, pauseBank: st.pauseBank, nextTactical: st.nextTactical,
  };
}
