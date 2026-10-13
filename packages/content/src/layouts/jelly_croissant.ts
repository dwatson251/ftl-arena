/** Room layout "jelly_croissant": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "jelly_croissant",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 3, y: 0, w: 2, h: 1 },
    { id: 1, x: 1, y: 1, w: 2, h: 2 },
    { id: 2, x: 3, y: 1, w: 2, h: 2 },
    { id: 3, x: 5, y: 1, w: 2, h: 2 },
    { id: 4, x: 0, y: 3, w: 2, h: 1 },
    { id: 5, x: 3, y: 3, w: 2, h: 1 },
    { id: 6, x: 6, y: 3, w: 2, h: 1 },
    { id: 7, x: 3, y: 4, w: 2, h: 1 },
  ],
  doors: [
    { x: 4, y: 1, a: 0, b: 2, vertical: false },
    { x: 3, y: 1, a: 1, b: 2, vertical: true },
    { x: 5, y: 1, a: 2, b: 3, vertical: true },
    { x: 6, y: 3, a: 3, b: 6, vertical: false },
    { x: 4, y: 3, a: 2, b: 5, vertical: false },
    { x: 1, y: 3, a: 1, b: 4, vertical: false },
    { x: 3, y: 4, a: 5, b: 7, vertical: false },
  ],
  img: { x: -51, y: -60, w: 383, h: 471 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 46, y: 161, rotate: false, mirror: true, slide: "left" },
    { x: 336, y: 161, rotate: false, mirror: false, slide: "right" },
    { x: 87, y: 84, rotate: false, mirror: true, slide: "left" },
    { x: 296, y: 84, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 170, b: 205, x: 0, y: -25 },
  gibs: [
    { n: 1, x: 85, y: 100, velocity: [0.1, 0.4], direction: [120, 240], angular: [0, 0.5] },
    { n: 2, x: 114, y: 166, velocity: [0.4, 1], direction: [120, 240], angular: [-0.2, 0.2] },
    { n: 3, x: 211, y: 38, velocity: [0.1, 0.9], direction: [200, 270], angular: [0, 1] },
    { n: 4, x: 0, y: 0, velocity: [0.3, 0.8], direction: [15, 80], angular: [-1, -0.1] },
  ],
};
export default layout;
