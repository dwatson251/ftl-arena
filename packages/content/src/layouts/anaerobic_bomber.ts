/** Room layout "anaerobic_bomber": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "anaerobic_bomber",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 1, h: 2 },
    { id: 1, x: 5, y: 0, w: 1, h: 2 },
    { id: 2, x: 0, y: 1, w: 1, h: 2 },
    { id: 3, x: 3, y: 1, w: 1, h: 2 },
    { id: 4, x: 6, y: 1, w: 1, h: 2 },
    { id: 5, x: 1, y: 2, w: 2, h: 2 },
    { id: 6, x: 4, y: 2, w: 2, h: 2 },
    { id: 7, x: 0, y: 3, w: 1, h: 2 },
    { id: 8, x: 6, y: 3, w: 1, h: 2 },
    { id: 9, x: 1, y: 4, w: 1, h: 2 },
    { id: 10, x: 5, y: 4, w: 1, h: 2 },
  ],
  doors: [
    { x: 1, y: 2, a: 0, b: 5, vertical: false },
    { x: 1, y: 2, a: 2, b: 5, vertical: true },
    { x: 1, y: 3, a: 5, b: 7, vertical: true },
    { x: 1, y: 4, a: 5, b: 9, vertical: false },
    { x: 3, y: 2, a: 3, b: 5, vertical: true },
    { x: 4, y: 2, a: 3, b: 6, vertical: true },
    { x: 5, y: 2, a: 1, b: 6, vertical: false },
    { x: 6, y: 2, a: 4, b: 6, vertical: true },
    { x: 6, y: 3, a: 6, b: 8, vertical: true },
    { x: 5, y: 4, a: 6, b: 10, vertical: false },
  ],
  img: { x: -99, y: -44, w: 443, h: 354 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 150, y: 25, rotate: false, mirror: true, slide: "up" },
    { x: 295, y: 25, rotate: false, mirror: false, slide: "up" },
    { x: 105, y: 80, rotate: false, mirror: true, slide: "left" },
    { x: 340, y: 80, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 200, b: 170, x: 0, y: -85 },
  gibs: [
    { n: 1, x: 213, y: 49, velocity: [0.1, 1], direction: [180, 240], angular: [0, 1] },
    { n: 2, x: 0, y: 0, velocity: [0.4, 0.8], direction: [-20, 60], angular: [-0.6, -0.1] },
    { n: 3, x: 159, y: 0, velocity: [0.4, 1], direction: [280, 350], angular: [0.1, 0.5] },
    { n: 4, x: 50, y: 57, velocity: [0.1, 0.3], direction: [90, 180], angular: [-0.5, 0.5] },
  ],
};
export default layout;
