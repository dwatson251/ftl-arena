/** Room layout "energy_fighter": rooms, doors, weapon mounts, hull image box, shield ellipse, gibs. */
import type { ShipLayout } from "@ftl/data";

const layout: ShipLayout = {
  id: "energy_fighter",
  xOffset: 0,
  yOffset: 0,
  rooms: [
    { id: 0, x: 2, y: 0, w: 1, h: 2 },
    { id: 1, x: 2, y: 2, w: 1, h: 2 },
    { id: 2, x: 1, y: 4, w: 2, h: 2 },
    { id: 3, x: 0, y: 6, w: 2, h: 1 },
    { id: 4, x: 2, y: 6, w: 2, h: 1 },
    { id: 5, x: 3, y: 5, w: 2, h: 1 },
    { id: 6, x: 4, y: 3, w: 1, h: 2 },
  ],
  doors: [
    { x: 2, y: 2, a: 0, b: 1, vertical: false },
    { x: 2, y: 4, a: 1, b: 2, vertical: false },
    { x: 1, y: 6, a: 2, b: 3, vertical: false },
    { x: 2, y: 6, a: 2, b: 4, vertical: false },
    { x: 3, y: 5, a: 2, b: 5, vertical: true },
    { x: 4, y: 5, a: 5, b: 6, vertical: false },
  ],
  img: { x: -30, y: -56, w: 242, h: 389 },
  floor: { x: 0, y: 0 },
  mounts: [
    { x: 95, y: 80, rotate: false, mirror: true, slide: "left" },
    { x: 205, y: 160, rotate: false, mirror: false, slide: "right" },
    { x: 28, y: 230, rotate: false, mirror: true, slide: "left" },
    { x: 74, y: 180, rotate: false, mirror: true, slide: "up" },
  ],
  ellipse: { a: 144, b: 202, x: 0, y: -94 },
  gibs: [
    { n: 1, x: 45, y: 0, velocity: [0.1, 0.8], direction: [-20, 20], angular: [-0.5, 0.5] },
    { n: 2, x: 37, y: 121, velocity: [0.1, 0.2], direction: [220, 240], angular: [-1, 1] },
    { n: 3, x: 86, y: 44, velocity: [0.5, 0.7], direction: [260, 280], angular: [0.1, 1] },
    { n: 4, x: 0, y: 154, velocity: [0.1, 0.6], direction: [90, 150], angular: [-0.5, -0.1] },
  ],
};
export default layout;
