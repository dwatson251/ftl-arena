/** Room layout "circle_bomber": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "circle_bomber",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 1, h: 2 },
    { id: 1, x: 2, y: 0, w: 2, h: 1 },
    { id: 2, x: 2, y: 1, w: 2, h: 1 },
    { id: 3, x: 4, y: 1, w: 2, h: 1 },
    { id: 4, x: 4, y: 2, w: 1, h: 2 },
    { id: 5, x: 5, y: 2, w: 1, h: 2 },
    { id: 6, x: 4, y: 4, w: 2, h: 1 },
    { id: 7, x: 4, y: 5, w: 2, h: 2 },
    { id: 8, x: 2, y: 6, w: 2, h: 1 },
    { id: 9, x: 0, y: 5, w: 2, h: 2 },
    { id: 10, x: 0, y: 4, w: 2, h: 1 },
    { id: 11, x: 0, y: 2, w: 2, h: 2 },
  ],
  doors: [
    { x: 0, y: 4, a: 10, b: 11, vertical: false },
    { x: 1, y: 5, a: 9, b: 10, vertical: false },
    { x: 2, y: 6, a: 8, b: 9, vertical: true },
    { x: 4, y: 6, a: 7, b: 8, vertical: true },
    { x: 4, y: 5, a: 6, b: 7, vertical: false },
    { x: 5, y: 4, a: 5, b: 6, vertical: false },
    { x: 5, y: 3, a: 4, b: 5, vertical: true },
    { x: 5, y: 2, a: 4, b: 5, vertical: true },
    { x: 5, y: 2, a: 3, b: 5, vertical: false },
    { x: 4, y: 1, a: 2, b: 3, vertical: true },
    { x: 2, y: 1, a: 0, b: 2, vertical: true },
    { x: 2, y: 0, a: 0, b: 1, vertical: true },
    { x: 1, y: 2, a: 0, b: 11, vertical: false },
  ],
  img: { x: -64, y: -34, w: 324, h: 336 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 48, y: 160, rotate: false, mirror: true, slide: "left" },
    { x: 236, y: 57, rotate: false, mirror: false, slide: "up" },
    { x: 80, y: 38, rotate: false, mirror: true, slide: "up" },
    { x: 293, y: 160, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 170, b: 205, x: -10, y: -92 },
  gibs: [
    { n: 1, x: 15, y: 43, velocity: [0.1, 1], direction: [20, 160], angular: [-1, 1] },
    { n: 2, x: 27, y: 0, velocity: [0.1, 0.3], direction: [280, 350], angular: [-1, 1] },
    { n: 3, x: 0, y: 141, velocity: [0.4, 1], direction: [190, 260], angular: [-0.4, 1] },
    { n: 4, x: 156, y: 37, velocity: [0.1, 0.6], direction: [-40, 40], angular: [-0.5, 0.5] },
  ],
};
export default layout;
