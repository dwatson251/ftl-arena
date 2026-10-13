/** Room layout "circle_scout": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "circle_scout",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 0, y: 0, w: 1, h: 2 },
    { id: 1, x: 1, y: 0, w: 2, h: 2 },
    { id: 2, x: 3, y: 0, w: 2, h: 1 },
    { id: 3, x: 4, y: 1, w: 1, h: 2 },
    { id: 4, x: 4, y: 3, w: 2, h: 2 },
    { id: 5, x: 2, y: 4, w: 2, h: 1 },
    { id: 6, x: 1, y: 3, w: 1, h: 2 },
    { id: 7, x: 0, y: 2, w: 2, h: 1 },
  ],
  doors: [
    { x: 1, y: 3, a: 6, b: 7, vertical: false },
    { x: 2, y: 4, a: 5, b: 6, vertical: true },
    { x: 4, y: 4, a: 4, b: 5, vertical: true },
    { x: 4, y: 3, a: 3, b: 4, vertical: false },
    { x: 4, y: 1, a: 2, b: 3, vertical: false },
    { x: 3, y: 0, a: 1, b: 2, vertical: true },
    { x: 1, y: 0, a: 0, b: 1, vertical: true },
    { x: 1, y: 1, a: 0, b: 1, vertical: true },
    { x: 0, y: 2, a: 0, b: 7, vertical: false },
  ],
  img: { x: -42, y: -47, w: 300, h: 282 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 32, y: 70, rotate: false, mirror: true, slide: "left" },
    { x: 226, y: 70, rotate: false, mirror: false, slide: "right" },
    { x: 135, y: 32, rotate: false, mirror: false, slide: "up" },
    { x: 268, y: 160, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 153, b: 166, x: 0, y: -105 },
  gibs: [
    { n: 1, x: 0, y: 0, velocity: [0.1, 1], direction: [20, 160], angular: [-1, 1] },
    { n: 2, x: 74, y: 0, velocity: [0.1, 0.3], direction: [280, 350], angular: [-1, 1] },
    { n: 3, x: 11, y: 92, velocity: [0.4, 1], direction: [190, 260], angular: [-0.4, 1] },
    { n: 4, x: 123, y: 104, velocity: [0.1, 0.6], direction: [-40, 40], angular: [-0.5, 0.5] },
  ],
};
export default layout;
