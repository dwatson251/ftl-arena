/** Room layout "crystal_bomber": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "crystal_bomber",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 2, h: 2 },
    { id: 1, x: 0, y: 1, w: 1, h: 2 },
    { id: 2, x: 1, y: 2, w: 2, h: 1 },
    { id: 3, x: 1, y: 3, w: 1, h: 2 },
    { id: 4, x: 1, y: 5, w: 2, h: 2 },
    { id: 5, x: 1, y: 7, w: 2, h: 1 },
    { id: 6, x: 3, y: 4, w: 1, h: 2 },
    { id: 7, x: 3, y: 1, w: 2, h: 2 },
    { id: 8, x: 3, y: 3, w: 2, h: 1 },
  ],
  doors: [
    { x: 3, y: 4, a: 6, b: 8, vertical: false },
    { x: 4, y: 3, a: 7, b: 8, vertical: false },
    { x: 3, y: 2, a: 2, b: 7, vertical: true },
    { x: 3, y: 1, a: 0, b: 7, vertical: true },
    { x: 1, y: 1, a: 0, b: 1, vertical: true },
    { x: 1, y: 2, a: 1, b: 2, vertical: true },
    { x: 1, y: 3, a: 2, b: 3, vertical: false },
    { x: 1, y: 5, a: 3, b: 4, vertical: false },
    { x: 3, y: 5, a: 4, b: 6, vertical: true },
    { x: 1, y: 7, a: 4, b: 5, vertical: false },
  ],
  img: { x: -68, y: -97, w: 292, h: 437 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 58, y: 130, rotate: false, mirror: true, slide: "left" },
    { x: 208, y: 70, rotate: false, mirror: false, slide: "right" },
    { x: 125, y: 80, rotate: false, mirror: true, slide: "left" },
    { x: 260, y: 160, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 170, b: 205, x: 0, y: -127 },
  gibs: [
    { n: 1, x: 8, y: 120, velocity: [0.3, 0.9], direction: [80, 160], angular: [-0.5, 0.5] },
    { n: 2, x: 84, y: 0, velocity: [0.1, 0.3], direction: [280, 350], angular: [-1, 1] },
    { n: 3, x: 25, y: 22, velocity: [0.1, 0.2], direction: [0, 90], angular: [-0.4, 1] },
    { n: 4, x: 47, y: 190, velocity: [0.1, 0.6], direction: [170, 230], angular: [0.1, 0.5] },
  ],
};
export default layout;
