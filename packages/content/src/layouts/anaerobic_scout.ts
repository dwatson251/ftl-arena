/** Room layout "anaerobic_scout": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "anaerobic_scout",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 1, y: 0, w: 2, h: 1 },
    { id: 1, x: 3, y: 0, w: 2, h: 1 },
    { id: 2, x: 5, y: 0, w: 2, h: 1 },
    { id: 3, x: 0, y: 1, w: 2, h: 1 },
    { id: 4, x: 2, y: 1, w: 2, h: 2 },
    { id: 5, x: 4, y: 1, w: 2, h: 2 },
    { id: 6, x: 6, y: 1, w: 2, h: 1 },
  ],
  doors: [
    { x: 2, y: 1, a: 0, b: 4, vertical: false },
    { x: 2, y: 1, a: 3, b: 4, vertical: true },
    { x: 4, y: 2, a: 4, b: 5, vertical: true },
    { x: 3, y: 1, a: 1, b: 4, vertical: false },
    { x: 4, y: 1, a: 1, b: 5, vertical: false },
    { x: 5, y: 1, a: 2, b: 5, vertical: false },
    { x: 6, y: 1, a: 5, b: 6, vertical: true },
  ],
  img: { x: -70, y: -55, w: 420, h: 244 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 150, y: 30, rotate: false, mirror: true, slide: "up" },
    { x: 264, y: 30, rotate: false, mirror: false, slide: "up" },
    { x: 89, y: 65, rotate: false, mirror: true, slide: "up" },
    { x: 324, y: 65, rotate: false, mirror: false, slide: "up" },
  ],
  ellipse: { a: 200, b: 130, x: 0, y: -95 },
  gibs: [
    { n: 1, x: 99, y: 0, velocity: [0.1, 0.3], direction: [60, 160], angular: [-1, 0.3] },
    { n: 2, x: 0, y: 17, velocity: [0.5, 0.7], direction: [45, 100], angular: [-0.7, -0.2] },
    { n: 3, x: 117, y: 0, velocity: [0.2, 0.4], direction: [180, 350], angular: [0, 0.4] },
    { n: 4, x: 218, y: 17, velocity: [0.5, 0.7], direction: [270, 340], angular: [0.4, 0.7] },
  ],
};
export default layout;
