/** Room layout "jelly_truffle": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "jelly_truffle",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 3, y: 0, w: 2, h: 1 },
    { id: 1, x: 3, y: 1, w: 2, h: 2 },
    { id: 2, x: 3, y: 3, w: 2, h: 1 },
    { id: 3, x: 3, y: 4, w: 2, h: 1 },
    { id: 4, x: 5, y: 2, w: 2, h: 1 },
    { id: 5, x: 1, y: 2, w: 2, h: 1 },
    { id: 6, x: 0, y: 3, w: 2, h: 1 },
    { id: 7, x: 6, y: 3, w: 2, h: 1 },
  ],
  doors: [
    { x: 3, y: 1, a: 0, b: 1, vertical: false },
    { x: 5, y: 2, a: 1, b: 4, vertical: true },
    { x: 3, y: 2, a: 1, b: 5, vertical: true },
    { x: 1, y: 3, a: 5, b: 6, vertical: false },
    { x: 6, y: 3, a: 4, b: 7, vertical: false },
    { x: 4, y: 3, a: 1, b: 2, vertical: false },
    { x: 3, y: 4, a: 2, b: 3, vertical: false },
  ],
  img: { x: -64, y: -70, w: 404, h: 389 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 150, y: 54, rotate: false, mirror: true, slide: "left" },
    { x: 254, y: 50, rotate: false, mirror: false, slide: "right" },
    { x: 73, y: 147, rotate: false, mirror: true, slide: "left" },
    { x: 330, y: 147, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 170, b: 205, x: 0, y: -67 },
  gibs: [
    { n: 1, x: 194, y: 0, velocity: [0.6, 1], direction: [280, 340], angular: [0.1, 1] },
    { n: 2, x: 135, y: 24, velocity: [0, 0.3], direction: [200, 260], angular: [-0.4, 0.2] },
    { n: 3, x: 18, y: 21, velocity: [0.2, 1], direction: [0, 120], angular: [-1, -0.1] },
    { n: 4, x: 83, y: 86, velocity: [0.3, 1], direction: [140, 220], angular: [-0.2, 0.2] },
  ],
};
export default layout;
