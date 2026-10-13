/** Room layout "crystal_scout": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "crystal_scout",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 0, y: 0, w: 1, h: 2 },
    { id: 1, x: 1, y: 0, w: 1, h: 2 },
    { id: 2, x: 1, y: 2, w: 2, h: 2 },
    { id: 3, x: 0, y: 4, w: 2, h: 1 },
    { id: 4, x: 0, y: 5, w: 2, h: 1 },
    { id: 5, x: 2, y: 4, w: 1, h: 2 },
  ],
  doors: [
    { x: 1, y: 1, a: 0, b: 1, vertical: true },
    { x: 2, y: 4, a: 3, b: 5, vertical: true },
    { x: 0, y: 5, a: 3, b: 4, vertical: false },
    { x: 2, y: 4, a: 2, b: 5, vertical: false },
    { x: 1, y: 2, a: 1, b: 2, vertical: false },
  ],
  img: { x: -50, y: -95, w: 206, h: 396 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 47, y: 70, rotate: false, mirror: true, slide: "left" },
    { x: 110, y: 80, rotate: false, mirror: false, slide: "right" },
    { x: 30, y: 250, rotate: false, mirror: true, slide: "left" },
    { x: 160, y: 170, rotate: false, mirror: false, slide: "right" },
  ],
  ellipse: { a: 136, b: 205, x: 0, y: -127 },
  gibs: [
    { n: 1, x: 64, y: 262, velocity: [0.3, 0.7], direction: [170, 200], angular: [-0.2, 0.2] },
    { n: 2, x: 0, y: 92, velocity: [0.3, 0.8], direction: [90, 170], angular: [-1, -0.1] },
    { n: 3, x: 0, y: 0, velocity: [0.4, 1], direction: [-30, 30], angular: [-0.4, 0.4] },
    { n: 4, x: 73, y: 112, velocity: [0.3, 0.6], direction: [220, 290], angular: [-0.5, 0.5] },
  ],
};
export default layout;
