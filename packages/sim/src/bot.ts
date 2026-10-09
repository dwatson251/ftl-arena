/** A simple opponent for practice and for the bench. It only issues Commands, like a human. */
import type { Command } from "./commands.ts";
import { geometry, roomCentre } from "./geometry.ts";
import type { Match } from "./match.ts";
import { TICK_HZ } from "./rules.ts";

export function botCommands(m: Match, me: 0 | 1): Command[] {
  const st = m.state;
  if (st.tick % TICK_HZ !== me * 7) return [];
  const out: Command[] = [];
  const ship = st.ships[me];
  const enemy = st.ships[1 - me];
  const eg = geometry(m.db.layouts[enemy.layout]);
  const prefer = (ids: string[]) => {
    for (const id of ids) {
      const s = enemy.systems[id as keyof typeof enemy.systems];
      if (s && s.damage < s.level) return s.room;
    }
    return enemy.rooms[0].id;
  };
  ship.weapons.forEach((w, slot) => {
    const bp = m.wbp(w.bp);
    if (!w.powered) out.push({ c: "weaponPower", slot, on: true });
    if (!w.autofire) out.push({ c: "autofire", slot, on: true });
    const room = bp.type === "MISSILES" || bp.type === "BOMB" ? prefer(["weapons", "shields", "pilot"]) : prefer(["shields", "weapons", "engines"]);
    if (bp.type === "BEAM") {
      const c = roomCentre(eg, room);
      out.push({ c: "target", slot, target: { kind: "beam", x1: c.x, y1: c.y, x2: c.x + 100, y2: c.y } });
    } else if (!w.target || (w.target.kind === "room" && w.target.room !== room)) {
      out.push({ c: "target", slot, target: { kind: "room", room } });
    }
  });
  // Keep the shields and engines fed, then send idle crew to damaged or burning rooms.
  const med = ship.systems.medbay;
  out.push({ c: "power", system: "shields", delta: 1 });
  if (!med || med.power === 0) out.push({ c: "power", system: "engines", delta: 1 });
  const g = geometry(m.db.layouts[ship.layout]);
  const busy = new Set<number>();
  // Wounded crew go to the medbay (powering it from the engines if the reactor is full), and come back.
  if (med) {
    const hurt = ship.crew.filter((c) => !c.dead && c.hp < 45 && g.tiles.get(c.home)?.room !== med.room);
    if (hurt.length && med.power === 0) out.push({ c: "power", system: "engines", delta: -1 }, { c: "power", system: "medbay", delta: 1 });
    for (const c of hurt) {
      busy.add(c.id);
      out.push({ c: "moveCrew", crew: [c.id], room: med.room });
    }
    const healed = ship.crew.filter((c) => !c.dead && c.hp >= c.maxHp && g.tiles.get(c.home)?.room === med.room);
    for (const c of healed) {
      const free = (["weapons", "shields", "engines", "pilot"] as const).map((id) => ship.systems[id]).find(
        (s) => s && !ship.crew.some((q) => !q.dead && q.home === s.station),
      );
      if (free) {
        busy.add(c.id);
        out.push({ c: "moveCrew", crew: [c.id], room: free.room });
      }
    }
    if (!hurt.length && !ship.crew.some((c) => !c.dead && g.tiles.get(c.home)?.room === med.room) && med.power > 0)
      out.push({ c: "power", system: "medbay", delta: -1 });
  }
  for (const rs of ship.rooms) {
    const sys = Object.values(ship.systems).find((s) => s && s.room === rs.id);
    const bad = Object.keys(rs.fires).length || Object.keys(rs.breaches).length || (sys && sys.damage > 0);
    if (!bad) continue;
    const here = ship.crew.some((c) => !c.dead && g.tiles.get(c.home)?.room === rs.id);
    if (here) continue;
    const spare = ship.crew.find((c) => !c.dead && !busy.has(c.id) && (c.task === "idle" || c.task === "man") && c.tile !== ship.systems.pilot?.station);
    if (spare) {
      busy.add(spare.id);
      out.push({ c: "moveCrew", crew: [spare.id], room: rs.id });
    }
  }
  return out;
}
