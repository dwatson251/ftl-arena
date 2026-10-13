/** Room layout "rebel_squat": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "rebel_squat",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 1, h: 2 },
    { id: 1, x: 3, y: 1, w: 2, h: 1 },
    { id: 2, x: 0, y: 2, w: 1, h: 2 },
    { id: 3, x: 1, y: 2, w: 1, h: 2 },
    { id: 4, x: 2, y: 2, w: 2, h: 2 },
    { id: 5, x: 4, y: 2, w: 2, h: 1 },
    { id: 6, x: 4, y: 3, w: 2, h: 1 },
    { id: 7, x: 2, y: 4, w: 2, h: 1 },
  ],
  doors: [
    { x: 1, y: 2, a: 0, b: 3, vertical: false },
    { x: 1, y: 2, a: 2, b: 3, vertical: true },
    { x: 2, y: 3, a: 3, b: 4, vertical: true },
    { x: 3, y: 2, a: 1, b: 4, vertical: false },
    { x: 4, y: 2, a: 1, b: 5, vertical: false },
    { x: 4, y: 3, a: 4, b: 6, vertical: true },
    { x: 4, y: 3, a: 5, b: 6, vertical: false },
    { x: 2, y: 4, a: 4, b: 7, vertical: false },
  ],
  img: { x: -80, y: -120, w: 362, h: 363 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 274, y: 115, rotate: false, mirror: true, slide: "left" },
    { x: 87, y: 115, rotate: false, mirror: false, slide: "right" },
    { x: 57, y: 65, rotate: false, mirror: true, slide: "up" },
    { x: 305, y: 65, rotate: false, mirror: false, slide: "up" },
  ],
  ellipse: { a: 200, b: 225, x: 0, y: -130 },
  gibs: [
    { n: 1, x: 0, y: 0, velocity: [0.4, 0.8], direction: [90, 120], angular: [-0.4, -0.2] },
    { n: 2, x: 0, y: 0, velocity: [0.1, 0.3], direction: [190, 230], angular: [-0.3, -0.2] },
    { n: 3, x: 54, y: 78, velocity: [0.3, 1], direction: [-40, 40], angular: [-0.4, 0.4] },
    { n: 4, x: 140, y: 0, velocity: [0.1, 0.5], direction: [290, 310], angular: [0.2, 0.9] },
  ],
};
export default layout;
