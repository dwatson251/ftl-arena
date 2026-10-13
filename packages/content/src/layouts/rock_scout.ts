/** Room layout "rock_scout": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "rock_scout",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 0, y: 0, w: 1, h: 2 },
    { id: 1, x: 1, y: 0, w: 2, h: 2 },
    { id: 2, x: 0, y: 2, w: 1, h: 2 },
    { id: 3, x: 1, y: 2, w: 2, h: 1 },
    { id: 4, x: 1, y: 3, w: 2, h: 2 },
    { id: 5, x: 0, y: 4, w: 1, h: 2 },
    { id: 6, x: 1, y: 5, w: 1, h: 2 },
  ],
  doors: [
    { x: 1, y: 0, a: 0, b: 1, vertical: true },
    { x: 0, y: 2, a: 0, b: 2, vertical: false },
    { x: 2, y: 3, a: 3, b: 4, vertical: false },
    { x: 1, y: 3, a: 2, b: 4, vertical: true },
    { x: 1, y: 4, a: 4, b: 5, vertical: true },
    { x: 1, y: 5, a: 5, b: 6, vertical: true },
  ],
  img: { x: -78, y: -43, w: 261, h: 344 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 48, y: 85, rotate: false, mirror: true, slide: "left" },
    { x: 213, y: 85, rotate: false, mirror: false, slide: "right" },
    { x: 92, y: 38, rotate: false, mirror: true, slide: "up" },
    { x: 167, y: 38, rotate: false, mirror: false, slide: "up" },
  ],
  ellipse: { a: 141, b: 170, x: 0, y: -104 },
  gibs: [
    { n: 1, x: 0, y: 0, velocity: [0.4, 0.8], direction: [0, 60], angular: [-1, -0.2] },
    { n: 2, x: 12, y: 18, velocity: [0.1, 0.4], direction: [-90, 90], angular: [-0.3, 0.3] },
    { n: 3, x: 45, y: 134, velocity: [0.2, 0.4], direction: [90, 180], angular: [-0.4, 1] },
    { n: 4, x: 70, y: 177, velocity: [0.4, 0.6], direction: [140, 200], angular: [-0.5, 0.5] },
  ],
};
export default layout;
