/** Room layout "mantis_scout": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "mantis_scout",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 0, y: 0, w: 1, h: 2 },
    { id: 1, x: 1, y: 1, w: 2, h: 1 },
    { id: 2, x: 1, y: 2, w: 2, h: 1 },
    { id: 3, x: 3, y: 1, w: 2, h: 2 },
    { id: 4, x: 3, y: 3, w: 2, h: 1 },
    { id: 5, x: 5, y: 1, w: 2, h: 1 },
    { id: 6, x: 5, y: 2, w: 2, h: 1 },
    { id: 7, x: 7, y: 0, w: 1, h: 2 },
  ],
  doors: [
    { x: 1, y: 1, a: 0, b: 1, vertical: true },
    { x: 2, y: 2, a: 1, b: 2, vertical: false },
    { x: 3, y: 2, a: 2, b: 3, vertical: true },
    { x: 5, y: 2, a: 3, b: 6, vertical: true },
    { x: 5, y: 2, a: 5, b: 6, vertical: false },
    { x: 7, y: 1, a: 5, b: 7, vertical: true },
    { x: 3, y: 3, a: 3, b: 4, vertical: false },
    { x: 4, y: 3, a: 3, b: 4, vertical: false },
  ],
  img: { x: -40, y: -105, w: 360, h: 274 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 58, y: 70, rotate: false, mirror: true, slide: "left" },
    { x: 305, y: 70, rotate: false, mirror: false, slide: "right" },
    { x: 105, y: 110, rotate: false, mirror: false, slide: "up" },
    { x: 255, y: 110, rotate: false, mirror: true, slide: "up" },
  ],
  ellipse: { a: 200, b: 140, x: 0, y: -160 },
  gibs: [
    { n: 1, x: 159, y: 69, velocity: [0.1, 0.3], direction: [200, 290], angular: [0.3, 0.7] },
    { n: 2, x: 194, y: 0, velocity: [0.3, 0.5], direction: [280, 350], angular: [-0.7, -0.1] },
    { n: 3, x: 51, y: 89, velocity: [0.2, 0.4], direction: [80, 120], angular: [-0.4, 0.4] },
    { n: 4, x: 0, y: 0, velocity: [0.2, 0.6], direction: [60, 120], angular: [-0.5, 0.1] },
  ],
};
export default layout;
