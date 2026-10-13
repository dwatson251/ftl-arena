/** Room layout "rock_assault": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "rock_assault",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 2, y: 0, w: 2, h: 1 },
    { id: 1, x: 0, y: 1, w: 2, h: 1 },
    { id: 2, x: 2, y: 1, w: 2, h: 2 },
    { id: 3, x: 4, y: 1, w: 2, h: 1 },
    { id: 4, x: 2, y: 3, w: 2, h: 2 },
    { id: 5, x: 0, y: 4, w: 2, h: 2 },
    { id: 6, x: 4, y: 4, w: 2, h: 2 },
    { id: 7, x: 2, y: 5, w: 2, h: 2 },
    { id: 8, x: 1, y: 7, w: 2, h: 1 },
    { id: 9, x: 3, y: 7, w: 2, h: 1 },
  ],
  doors: [
    { x: 2, y: 7, a: 7, b: 8, vertical: false },
    { x: 3, y: 7, a: 7, b: 9, vertical: false },
    { x: 2, y: 5, a: 5, b: 7, vertical: true },
    { x: 2, y: 5, a: 4, b: 7, vertical: false },
    { x: 4, y: 4, a: 4, b: 6, vertical: true },
    { x: 3, y: 3, a: 2, b: 4, vertical: false },
    { x: 4, y: 1, a: 2, b: 3, vertical: true },
    { x: 2, y: 1, a: 0, b: 2, vertical: false },
    { x: 2, y: 1, a: 1, b: 2, vertical: true },
  ],
  img: { x: -54, y: -68, w: 318, h: 420 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 70, y: 70, rotate: false, mirror: true, slide: "up" },
    { x: 248, y: 70, rotate: false, mirror: false, slide: "up" },
    { x: 42, y: 225, rotate: false, mirror: true, slide: "left" },
    { x: 276, y: 225, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 160, b: 230, x: 0, y: -104 },
  gibs: [
    { n: 1, x: 115, y: 0, velocity: [0.5, 1], direction: [280, 300], angular: [-0.5, 0.5] },
    { n: 2, x: 21, y: 3, velocity: [0.2, 0.4], direction: [0, 40], angular: [-0.5, 0.2] },
    { n: 3, x: 0, y: 112, velocity: [0.2, 0.6], direction: [120, 160], angular: [-0.6, -0.1] },
    { n: 4, x: 118, y: 139, velocity: [0.2, 0.6], direction: [200, 260], angular: [-0.2, 0.2] },
  ],
};
export default layout;
