/** Room layout "fed_bomber": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "fed_bomber",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 3, y: 0, w: 2, h: 1 },
    { id: 1, x: 3, y: 1, w: 2, h: 2 },
    { id: 2, x: 3, y: 3, w: 2, h: 1 },
    { id: 3, x: 3, y: 4, w: 2, h: 1 },
    { id: 4, x: 2, y: 3, w: 1, h: 2 },
    { id: 5, x: 2, y: 5, w: 1, h: 2 },
    { id: 6, x: 0, y: 4, w: 2, h: 2 },
    { id: 7, x: 5, y: 3, w: 1, h: 2 },
    { id: 8, x: 5, y: 5, w: 1, h: 2 },
    { id: 9, x: 6, y: 4, w: 2, h: 2 },
  ],
  doors: [
    { x: 4, y: 1, a: 0, b: 1, vertical: false },
    { x: 3, y: 3, a: 1, b: 2, vertical: false },
    { x: 4, y: 4, a: 2, b: 3, vertical: false },
    { x: 3, y: 3, a: 2, b: 4, vertical: true },
    { x: 5, y: 3, a: 2, b: 7, vertical: true },
    { x: 2, y: 4, a: 4, b: 6, vertical: true },
    { x: 2, y: 5, a: 5, b: 6, vertical: true },
    { x: 6, y: 4, a: 7, b: 9, vertical: true },
    { x: 6, y: 5, a: 8, b: 9, vertical: true },
  ],
  img: { x: -46, y: -38, w: 372, h: 356 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 126, y: 65, rotate: false, mirror: true, slide: "left" },
    { x: 246, y: 65, rotate: false, mirror: false, slide: "right" },
    { x: 48, y: 160, rotate: false, mirror: true, slide: "left" },
    { x: 324, y: 160, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 170, b: 205, x: 0, y: -85 },
  gibs: [
    { n: 1, x: 0, y: 65, velocity: [0.4, 1], direction: [70, 90], angular: [-1, 1] },
    { n: 2, x: 166, y: 129, velocity: [0.3, 0.7], direction: [220, 240], angular: [-0.4, 0.4] },
    { n: 3, x: 77, y: 0, velocity: [0.2, 0.4], direction: [290, 0], angular: [-0.4, 1] },
    { n: 4, x: 36, y: 104, velocity: [0.1, 0.3], direction: [-160, 180], angular: [-0.5, 0.5] },
  ],
};
export default layout;
