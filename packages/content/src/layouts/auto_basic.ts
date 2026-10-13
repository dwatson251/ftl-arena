/** Room layout "auto_basic": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "auto_basic",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 0, y: 0, w: 2, h: 1 },
    { id: 1, x: 1, y: 1, w: 2, h: 1 },
    { id: 2, x: 3, y: 1, w: 1, h: 2 },
    { id: 3, x: 4, y: 1, w: 2, h: 1 },
    { id: 4, x: 5, y: 0, w: 2, h: 1 },
  ],
  doors: [
    { x: 5, y: 1, a: 3, b: 4, vertical: false },
    { x: 4, y: 1, a: 2, b: 3, vertical: true },
    { x: 3, y: 1, a: 1, b: 2, vertical: true },
    { x: 1, y: 1, a: 0, b: 1, vertical: false },
  ],
  img: { x: -68, y: -60, w: 384, h: 227 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 149, y: 50, rotate: false, mirror: true, slide: "up" },
    { x: 234, y: 50, rotate: false, mirror: false, slide: "up" },
    { x: 99, y: 43, rotate: false, mirror: true, slide: "up" },
    { x: 284, y: 43, rotate: false, mirror: false, slide: "up" },
  ],
  ellipse: { a: 200, b: 120, x: 0, y: -110 },
  gibs: [
    { n: 1, x: 15, y: 12, velocity: [0.5, 1], direction: [40, 140], angular: [-1, 1] },
    { n: 2, x: 85, y: 23, velocity: [0.1, 0.5], direction: [40, 240], angular: [-0.4, 0.4] },
    { n: 3, x: 161, y: 6, velocity: [0.3, 0.8], direction: [280, 350], angular: [0, 0.8] },
    { n: 4, x: 227, y: 66, velocity: [0.2, 0.6], direction: [200, 250], angular: [-0.4, -0.4] },
  ],
};
export default layout;
