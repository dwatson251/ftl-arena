/** Room layout "jelly_button": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "jelly_button",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 2, h: 1 },
    { id: 1, x: 1, y: 1, w: 1, h: 2 },
    { id: 2, x: 2, y: 1, w: 1, h: 2 },
    { id: 3, x: 0, y: 2, w: 1, h: 2 },
    { id: 4, x: 3, y: 2, w: 1, h: 2 },
  ],
  doors: [
    { x: 1, y: 1, a: 0, b: 1, vertical: false },
    { x: 2, y: 1, a: 0, b: 2, vertical: false },
    { x: 2, y: 2, a: 1, b: 2, vertical: true },
  ],
  img: { x: -66, y: -60, w: 271, h: 359 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 52, y: 136, rotate: false, mirror: true, slide: "left" },
    { x: 218, y: 136, rotate: false, mirror: false, slide: "right" },
    { x: 63, y: 107, rotate: false, mirror: true, slide: "left" },
    { x: 207, y: 107, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 170, b: 205, x: 0, y: -50 },
  gibs: [
    { n: 1, x: 0, y: 51, velocity: [0.2, 1], direction: [90, 140], angular: [-1, -0.1] },
    { n: 2, x: 43, y: 82, velocity: [0.1, 0.6], direction: [140, 220], angular: [-0.3, 0.3] },
    { n: 3, x: 102, y: 41, velocity: [0.1, 0.6], direction: [200, 260], angular: [0.1, 1] },
    { n: 4, x: 52, y: 13, velocity: [0.1, 1], direction: [-40, 40], angular: [-1, 1] },
  ],
};
export default layout;
