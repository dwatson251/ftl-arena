/** Room layout "rebel_long": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "rebel_long",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 2, y: 0, w: 1, h: 2 },
    { id: 1, x: 2, y: 2, w: 1, h: 2 },
    { id: 2, x: 3, y: 3, w: 1, h: 2 },
    { id: 3, x: 1, y: 3, w: 1, h: 2 },
    { id: 4, x: 0, y: 5, w: 2, h: 2 },
    { id: 5, x: 2, y: 5, w: 1, h: 2 },
    { id: 6, x: 3, y: 5, w: 2, h: 2 },
  ],
  doors: [
    { x: 2, y: 2, a: 0, b: 1, vertical: false },
    { x: 3, y: 3, a: 1, b: 2, vertical: true },
    { x: 2, y: 3, a: 1, b: 3, vertical: true },
    { x: 4, y: 3, a: 2, b: -1, vertical: true },
    { x: 3, y: 5, a: 2, b: 6, vertical: false },
    { x: 2, y: 5, a: 4, b: 5, vertical: true },
    { x: 3, y: 6, a: 5, b: 6, vertical: true },
    { x: 1, y: 5, a: 3, b: 4, vertical: false },
  ],
  img: { x: -86, y: -45, w: 346, h: 509 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 138, y: 120, rotate: false, mirror: true, slide: "left" },
    { x: 207, y: 120, rotate: false, mirror: false, slide: "right" },
    { x: 65, y: 192, rotate: false, mirror: true, slide: "left" },
    { x: 280, y: 192, rotate: false, mirror: false, slide: "right" },
    { x: 134, y: 132, rotate: false, mirror: true, slide: "" },
    { x: 205, y: 132, rotate: false, mirror: false, slide: "" },
    { x: 58, y: 168, rotate: false, mirror: true, slide: "" },
    { x: 282, y: 168, rotate: false, mirror: false, slide: "" },
  ],
  ellipse: { a: 192, b: 270, x: 0, y: 0 },
  gibs: [
    { n: 1, x: 0, y: 133, velocity: [0.2, 0.8], direction: [120, 150], angular: [-1, -0.1] },
    { n: 2, x: 48, y: 107, velocity: [0, 0.2], direction: [90, 180], angular: [-0.4, 0.4] },
    { n: 3, x: 190, y: 135, velocity: [0.3, 0.6], direction: [240, 270], angular: [0.2, 1] },
    { n: 4, x: 104, y: 0, velocity: [0.2, 0.5], direction: [280, 310], angular: [0.2, 0.7] },
  ],
};
export default layout;
