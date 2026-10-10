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
  /** Level 3 sensors: weapon charge. */
  weaponsKnown: boolean;
  /** Level 4 (manned level 3) sensors: system power, ion and repair or sabotage progress. */
  systemsKnown: boolean;
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

/**
 * FTL's sensors (wiki): level 1 shows your own interior, 2 the enemy's, 3 their weapons' charge, 4 (manned level 3)
 * their systems' power, bars, ion and repair or sabotage progress. A cloaked enemy hides its interior (level 2+
 * still reads its crew), and the Rebel flagship holds sensors to level 2. Without sight of a room, telepathy
 * (Slug crew, the Lifeform Scanner) still senses the live crew in it as silhouettes: race and what they're
 * doing, no name or health; crew drones give off no life signs. A Slug also sees into every room touching its
 * own, walls or not, on whichever ship it stands.
 */
export function viewFor(m: Match, you: 0 | 1, events: MatchEvent[] = m.state.events, reveal = false): MatchView {
  const st = m.state;
  const own = st.ships[you];
  const enemy = st.ships[1 - you];
  const over = st.winner !== null || reveal;
  let sensors = m.eff(own.systems.sensors);
  if (/^BOSS_/.test(enemy.bp)) sensors = Math.min(2, sensors);
  const mine = m.crewOf(you).filter((c) => !c.dead && c.dying === undefined);
  const telepath = mine.some((c) => raceOf(c.race).telepathic) || (own.augments ?? []).includes("LIFE_SCANNER");
  const cloaked = (enemy.cloak?.t ?? 0) > 0;

  /** Rooms the viewer sees into on a ship: where their crew stand, and every room touching a Slug's. */
  const sight = (ship: ShipState): Set<number> => {
    const g = geometry(m.db.layouts[ship.layout]);
    const seen = new Set<number>();
    for (const c of ship.crew) {
      if (c.dead || c.dying !== undefined || (c.mind?.owner ?? c.owner) !== you || c.drone !== undefined) continue;
      const room = g.tiles.get(c.tile)?.room ?? -1;
      seen.add(room);
      if (!raceOf(c.race).telepathic) continue;
      for (const t of g.roomTiles.get(room) ?? []) {
        const [x, y] = t.split(",").map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const r = g.tiles.get(`${x + dx},${y + dy}`)?.room;
          if (r !== undefined) seen.add(r);
        }
      }
    }
    return seen;
  };
  /** Crew in rooms not seen: telepathy turns live, non-drone ones into silhouettes; the rest are hidden. */
  const sense = (ship: ShipState, seen: Set<number>, list: ShipState["crew"]): ShipState["crew"] => {
    const g = geometry(m.db.layouts[ship.layout]);
    return list.flatMap((c) => {
      if ((c.mind?.owner ?? c.owner) === you || seen.has(g.tiles.get(c.tile)?.room ?? -1)) return [c];
      if (!telepath || c.dead || c.dying !== undefined || c.drone !== undefined) return [];
      return [{
        id: c.id, name: "", race: c.race, hp: 1, maxHp: 1, x: c.x, y: c.y, tile: c.tile, path: c.path.slice(0, 1), home: c.home, task: c.task,
        face: c.face, punch: c.punch, atk: c.atk, atkDur: c.atkDur, aim: c.aim, beam: c.beam,
        xp: { pilot: 0, engines: 0, shields: 0, weapons: 0, repair: 0, combat: 0 }, stun: 0, dead: false, blip: true, owner: c.owner,
      }];
    });
  };

  const ownView: ShipView = { ...structuredClone(own), visibleRooms: null, interior: true, weaponsKnown: true, systemsKnown: true };
  if (sensors <= 0 && !over) {
    const seen = sight(own);
    ownView.visibleRooms = [...seen];
    ownView.crew = sense(own, seen, ownView.crew);
  }

  const ev = structuredClone(enemy) as ShipView;
  ev.visibleRooms = null;
  ev.interior = over || (sensors >= 2 && !cloaked);
  ev.weaponsKnown = over || sensors >= 3;
  ev.systemsKnown = over || sensors >= 4;
  if (!ev.interior) {
    const eg = geometry(m.db.layouts[enemy.layout]);
    const seen = sight(enemy);
    // An attached hacking drone shows its room too.
    if (own.hack?.attached) seen.add(own.hack.room);
    // Cloaked, level-2 sensors still read the crew (FTL shows their names and health in the tooltip).
    if (!cloaked || sensors < 2 || over) ev.crew = sense(enemy, seen, ev.crew);
    ev.visibleRooms = [...seen];
    for (const r of ev.rooms) {
      if (seen.has(r.id)) continue;
      r.o2 = -1;
      r.fires = {};
      r.breaches = {};
    }
    void eg;
  }
  // A hacking drone on their weapons room reads the guns' charge (FTL shows a hacked room's full detail).
  ev.weaponChargeKnown = ev.weaponsKnown || (!!own.hack?.attached && own.hack.room === enemy.systems.weapons?.room);
  if (!ev.weaponChargeKnown) {
    for (const w of ev.weapons) {
      w.charge = -1;
      w.volleys = 0;
      w.powered = false;
      w.boost = 0;
    }
  }
  if (!ev.systemsKnown) {
    // Below level 4: damage shows (the icons), but not power, ion or repair and sabotage progress.
    for (const s of Object.values(ev.systems)) {
      if (!s) continue;
      s.power = -1;
      s.ion = 0;
      s.ionTimer = 0;
      s.repair = 0;
    }
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
