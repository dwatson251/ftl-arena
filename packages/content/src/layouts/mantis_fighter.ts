/** Room layout "mantis_fighter": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "mantis_fighter",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 0, y: 1, w: 1, h: 2 },
    { id: 1, x: 1, y: 2, w: 2, h: 1 },
    { id: 2, x: 1, y: 3, w: 2, h: 1 },
    { id: 3, x: 3, y: 2, w: 2, h: 2 },
    { id: 4, x: 3, y: 4, w: 2, h: 1 },
    { id: 5, x: 5, y: 2, w: 2, h: 1 },
    { id: 6, x: 5, y: 3, w: 2, h: 1 },
    { id: 7, x: 7, y: 1, w: 1, h: 2 },
    { id: 8, x: 3, y: 1, w: 2, h: 1 },
    { id: 9, x: 3, y: 0, w: 2, h: 1 },
  ],
  doors: [
    { x: 4, y: 1, a: 8, b: 9, vertical: false },
    { x: 3, y: 2, a: 3, b: 8, vertical: false },
    { x: 3, y: 4, a: 3, b: 4, vertical: false },
    { x: 4, y: 4, a: 3, b: 4, vertical: false },
    { x: 3, y: 3, a: 2, b: 3, vertical: true },
    { x: 2, y: 3, a: 1, b: 2, vertical: false },
    { x: 1, y: 2, a: 0, b: 1, vertical: true },
    { x: 5, y: 3, a: 5, b: 6, vertical: false },
    { x: 5, y: 3, a: 3, b: 6, vertical: true },
    { x: 7, y: 2, a: 5, b: 7, vertical: true },
  ],
  img: { x: -36, y: -105, w: 351, h: 316 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 47, y: 120, rotate: false, mirror: true, slide: "left" },
    { x: 304, y: 120, rotate: false, mirror: false, slide: "right" },
    { x: 147, y: 80, rotate: false, mirror: true, slide: "left" },
    { x: 205, y: 80, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 170, b: 158, x: 0, y: -160 },
  gibs: [
    { n: 1, x: 0, y: 27, velocity: [0.3, 0.6], direction: [80, 110], angular: [-0.4, 0.1] },
    { n: 2, x: 29, y: 0, velocity: [0.1, 0.2], direction: [0, 40], angular: [-0.2, 0] },
    { n: 3, x: 93, y: 98, velocity: [0.2, 0.5], direction: [190, 220], angular: [-0.4, -0.1] },
    { n: 4, x: 229, y: 42, velocity: [0.4, 1], direction: [-40, 20], angular: [-0.5, 0.5] },
  ],
};
export default layout;
