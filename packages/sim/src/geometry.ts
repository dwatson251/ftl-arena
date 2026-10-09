/** Static tile graph of a ship layout: tiles, which room each is in, and door edges. Never serialised. */
import type { ShipLayout } from "@ftl/data";
import { TILE } from "./rules.ts";

export interface TileRef {
  x: number;
  y: number;
  room: number;
}

export interface DoorEdge {
  index: number;
  /** Tile keys on each side; "" means space. */
  t1: string;
  t2: string;
  roomA: number;
  roomB: number;
  /** Door centre in grid pixels, for drawing and click hit-tests. */
  px: number;
  py: number;
  vertical: boolean;
}

export interface Geometry {
  layout: ShipLayout;
  tiles: Map<string, TileRef>;
  roomTiles: Map<number, string[]>;
  doors: DoorEdge[];
  /** tile key -> neighbouring tile keys with the door index used (-1 = open floor inside a room). */
  adj: Map<string, { to: string; door: number }[]>;
  /** room -> neighbouring rooms through doors (-1 = space). */
  roomDoors: Map<number, number[]>;
}

export const key = (x: number, y: number) => `${x},${y}`;
export const unkey = (k: string): [number, number] => {
  const i = k.indexOf(",");
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
};

const cache = new WeakMap<ShipLayout, Geometry>();

export function geometry(layout: ShipLayout): Geometry {
  const hit = cache.get(layout);
  if (hit) return hit;
  const tiles = new Map<string, TileRef>();
  const roomTiles = new Map<number, string[]>();
  for (const r of layout.rooms) {
    const list: string[] = [];
    for (let dy = 0; dy < r.h; dy++)
      for (let dx = 0; dx < r.w; dx++) {
        const k = key(r.x + dx, r.y + dy);
        tiles.set(k, { x: r.x + dx, y: r.y + dy, room: r.id });
        list.push(k);
      }
    roomTiles.set(r.id, list);
  }
  const adj = new Map<string, { to: string; door: number }[]>();
  for (const k of tiles.keys()) adj.set(k, []);
  const link = (a: string, b: string, door: number) => {
    adj.get(a)?.push({ to: b, door });
    adj.get(b)?.push({ to: a, door });
  };
  for (const [k, t] of tiles) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const n = tiles.get(key(t.x + dx, t.y + dy));
      if (n && n.room === t.room) link(k, key(t.x + dx, t.y + dy), -1);
    }
  }
  const doors: DoorEdge[] = [];
  const roomDoors = new Map<number, number[]>();
  const addRoomLink = (a: number, b: number) => {
    if (a >= 0) roomDoors.set(a, [...(roomDoors.get(a) ?? []), b]);
  };
  layout.doors.forEach((d, index) => {
    // A vertical door sits on the wall between (x-1, y) and (x, y); a horizontal one between (x, y-1) and (x, y).
    const k1 = d.vertical ? key(d.x - 1, d.y) : key(d.x, d.y - 1);
    const k2 = key(d.x, d.y);
    const t1 = tiles.has(k1) ? k1 : "";
    const t2 = tiles.has(k2) ? k2 : "";
    const roomA = t1 ? tiles.get(t1)!.room : -1;
    const roomB = t2 ? tiles.get(t2)!.room : -1;
    if (t1 && t2) link(t1, t2, index);
    addRoomLink(roomA, roomB);
    addRoomLink(roomB, roomA);
    doors.push({
      index, t1, t2, roomA, roomB, vertical: d.vertical,
      px: d.vertical ? d.x * TILE : d.x * TILE + TILE / 2,
      py: d.vertical ? d.y * TILE + TILE / 2 : d.y * TILE,
    });
  });
  const g: Geometry = { layout, tiles, roomTiles, doors, adj, roomDoors };
  cache.set(layout, g);
  return g;
}

/** Breadth-first tile path from a to b (both tile keys); returns keys after a, or null. */
export function findPath(g: Geometry, a: string, b: string): string[] | null {
  if (a === b) return [];
  const prev = new Map<string, string>([[a, a]]);
  const q = [a];
  while (q.length) {
    const cur = q.shift()!;
    for (const { to } of g.adj.get(cur) ?? []) {
      if (prev.has(to)) continue;
      prev.set(to, cur);
      if (to === b) {
        const path = [b];
        let p = cur;
        while (p !== a) {
          path.push(p);
          p = prev.get(p)!;
        }
        return path.reverse();
      }
      q.push(to);
    }
  }
  return null;
}

/** Room containing a grid-pixel point, or -1. */
export function roomAt(g: Geometry, px: number, py: number): number {
  const t = g.tiles.get(key(Math.floor(px / TILE), Math.floor(py / TILE)));
  return t ? t.room : -1;
}

export function roomCentre(g: Geometry, room: number): { x: number; y: number } {
  const r = g.layout.rooms.find((q) => q.id === room)!;
  return { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE };
}
