/** Room layout "energy_bomber": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "energy_bomber",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 2, h: 2 },
    { id: 1, x: 1, y: 2, w: 2, h: 1 },
    { id: 2, x: 3, y: 2, w: 1, h: 2 },
    { id: 3, x: 1, y: 3, w: 2, h: 2 },
    { id: 4, x: 3, y: 4, w: 1, h: 2 },
    { id: 5, x: 1, y: 5, w: 1, h: 2 },
    { id: 6, x: 3, y: 6, w: 1, h: 2 },
    { id: 7, x: 0, y: 7, w: 2, h: 2 },
  ],
  doors: [
    { x: 1, y: 7, a: 5, b: 7, vertical: false },
    { x: 1, y: 5, a: 3, b: 5, vertical: false },
    { x: 3, y: 4, a: 3, b: 4, vertical: true },
    { x: 3, y: 3, a: 2, b: 3, vertical: true },
    { x: 3, y: 6, a: 4, b: 6, vertical: false },
    { x: 2, y: 3, a: 1, b: 3, vertical: false },
    { x: 1, y: 3, a: 1, b: 3, vertical: false },
    { x: 1, y: 2, a: 0, b: 1, vertical: false },
    { x: 2, y: 2, a: 0, b: 1, vertical: false },
  ],
  img: { x: -30, y: -56, w: 213, h: 453 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 33, y: 120, rotate: false, mirror: true, slide: "left" },
    { x: 177, y: 180, rotate: false, mirror: false, slide: "right" },
    { x: 76, y: 45, rotate: false, mirror: true, slide: "up" },
    { x: 145, y: 56, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 128, b: 225, x: 0, y: -94 },
  gibs: [
    { n: 1, x: 69, y: 246, velocity: [0.2, 0.7], direction: [180, 220], angular: [-1, 1] },
    { n: 2, x: 49, y: 52, velocity: [0.1, 0.3], direction: [260, 300], angular: [0, 0.5] },
    { n: 3, x: 8, y: 149, velocity: [0.1, 0.3], direction: [190, 260], angular: [-0.6, -0.2] },
    { n: 4, x: 0, y: 0, velocity: [0.4, 0.7], direction: [0, 40], angular: [-0.5, 0] },
  ],
};
export default layout;
