/** Room layout "mantis_bomber": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "mantis_bomber",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 3, y: 0, w: 2, h: 2 },
    { id: 1, x: 3, y: 2, w: 2, h: 2 },
    { id: 2, x: 2, y: 3, w: 1, h: 2 },
    { id: 3, x: 3, y: 4, w: 2, h: 1 },
    { id: 4, x: 3, y: 5, w: 2, h: 1 },
    { id: 5, x: 5, y: 3, w: 1, h: 2 },
    { id: 6, x: 3, y: 6, w: 2, h: 2 },
    { id: 7, x: 3, y: 8, w: 2, h: 1 },
    { id: 8, x: 1, y: 7, w: 2, h: 2 },
    { id: 9, x: 0, y: 6, w: 1, h: 2 },
    { id: 10, x: 5, y: 7, w: 2, h: 2 },
    { id: 11, x: 7, y: 6, w: 1, h: 2 },
  ],
  doors: [
    { x: 3, y: 2, a: 0, b: 1, vertical: false },
    { x: 4, y: 5, a: 3, b: 4, vertical: false },
    { x: 3, y: 6, a: 4, b: 6, vertical: false },
    { x: 3, y: 4, a: 2, b: 3, vertical: true },
    { x: 3, y: 3, a: 1, b: 2, vertical: true },
    { x: 5, y: 3, a: 1, b: 5, vertical: true },
    { x: 5, y: 4, a: 3, b: 5, vertical: true },
    { x: 3, y: 8, a: 6, b: 7, vertical: false },
    { x: 4, y: 8, a: 6, b: 7, vertical: false },
    { x: 3, y: 7, a: 6, b: 8, vertical: true },
    { x: 1, y: 7, a: 8, b: 9, vertical: true },
    { x: 5, y: 7, a: 6, b: 10, vertical: true },
    { x: 7, y: 7, a: 10, b: 11, vertical: true },
  ],
  img: { x: -67, y: -90, w: 414, h: 453 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 110, y: 250, rotate: false, mirror: true, slide: "left" },
    { x: 305, y: 250, rotate: false, mirror: false, slide: "right" },
    { x: 155, y: 90, rotate: false, mirror: true, slide: "left" },
    { x: 259, y: 90, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 192, b: 232, x: 0, y: -110 },
  gibs: [
    { n: 1, x: 81, y: 31, velocity: [0.1, 0.4], direction: [30, 80], angular: [0.1, 0.5] },
    { n: 2, x: 108, y: 0, velocity: [0.2, 0.4], direction: [280, 350], angular: [0, 0.4] },
    { n: 3, x: 0, y: 177, velocity: [0.3, 0.8], direction: [100, 140], angular: [-0.7, -0.1] },
    { n: 4, x: 86, y: 193, velocity: [0.1, 0.6], direction: [180, 230], angular: [0.1, 0.5] },
  ],
};
export default layout;
